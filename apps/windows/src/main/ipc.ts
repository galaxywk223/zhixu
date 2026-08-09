import { z } from "zod";
import { BrowserWindow, ipcMain, nativeTheme, Notification } from "electron";
import {
  lifeEventDraftSchema,
  noteDraftSchema,
  scheduleDraftSchema,
  taskDraftSchema,
  taskStatusSchema,
  themeModeSchema,
  uiScaleSchema,
  type UiScale,
} from "@zhixu/contracts";
import type { MigrationReport } from "../preload/api-types";
import { BackupService } from "./services/backup";
import { TomatoImportService } from "./services/tomato-import";
import { UpdateService } from "./services/updates";
import { ZhixuStore } from "./store";

interface IpcDependencies {
  store: ZhixuStore;
  migration: MigrationReport;
  version: string;
  getWindow: () => BrowserWindow | null;
  backup: BackupService;
  importer: TomatoImportService;
  updates: UpdateService;
  packaged: boolean;
  applyUiScale(uiScale: UiScale): void;
}

const idSchema = z.string().min(1).max(200);
const tagInputSchema = z.object({
  id: idSchema.optional(),
  name: z.string().trim().min(1).max(100),
  colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});
const settingsSchema = z.object({
  themeMode: themeModeSchema,
  uiScale: uiScaleSchema,
  closeToTray: z.boolean(),
  startMinimized: z.boolean(),
});

export function registerIpc(dependencies: IpcDependencies): void {
  const { store, getWindow } = dependencies;
  const notifyChanged = (scope: string): void =>
    getWindow()?.webContents.send("app:data-changed", scope);
  const mutation =
    <TArgs extends unknown[], TResult>(
      scope: string,
      handler: (...args: TArgs) => TResult | Promise<TResult>,
    ) =>
    async (
      _event: Electron.IpcMainInvokeEvent,
      ...args: TArgs
    ): Promise<TResult> => {
      const result = await handler(...args);
      notifyChanged(scope);
      return result;
    };

  ipcMain.handle("app:bootstrap", () => ({
    version: dependencies.version,
    migration: dependencies.migration,
    settings: store.getSettings(),
  }));
  ipcMain.handle("window:minimize", () => getWindow()?.minimize());
  ipcMain.handle("window:toggle-maximize", () => {
    const window = getWindow();
    if (!window) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  ipcMain.handle("window:close", () => getWindow()?.close());

  ipcMain.handle("tasks:list", () => store.listTasks());
  ipcMain.handle(
    "tasks:save",
    mutation("tasks", (value) => store.saveTask(taskDraftSchema.parse(value))),
  );
  ipcMain.handle(
    "tasks:set-status",
    mutation("tasks", (value) => {
      const parsed = z
        .object({ id: idSchema, status: taskStatusSchema })
        .parse(value);
      store.setTaskStatus(parsed.id, parsed.status);
    }),
  );
  ipcMain.handle(
    "tasks:remove",
    mutation("tasks", (id) => store.removeTask(idSchema.parse(id))),
  );
  ipcMain.handle("tasks:categories", () => store.listCategories());
  ipcMain.handle("tasks:tags", () => store.listTags());
  ipcMain.handle(
    "tasks:save-tag",
    mutation("tasks", (value) => store.saveTag(tagInputSchema.parse(value))),
  );
  ipcMain.handle(
    "tasks:remove-tag",
    mutation("tasks", (id) => store.removeTag(idSchema.parse(id))),
  );

  ipcMain.handle("calendar:list", (_event, value) => {
    const parsed = z
      .object({ startAt: z.string().datetime(), endAt: z.string().datetime() })
      .parse(value);
    return store.listScheduleBlocks(parsed.startAt, parsed.endAt);
  });
  ipcMain.handle(
    "calendar:save",
    mutation("calendar", (value) =>
      store.saveScheduleBlock(scheduleDraftSchema.parse(value)),
    ),
  );
  ipcMain.handle(
    "calendar:remove",
    mutation("calendar", (id) => store.removeScheduleBlock(idSchema.parse(id))),
  );

  ipcMain.handle("notes:list", () => store.listNotes());
  ipcMain.handle(
    "notes:save",
    mutation("notes", (value) => store.saveNote(noteDraftSchema.parse(value))),
  );
  ipcMain.handle(
    "notes:remove",
    mutation("notes", (id) => store.removeNote(idSchema.parse(id))),
  );

  ipcMain.handle("focus:list", () => store.listFocusSessions());
  ipcMain.handle("focus:batches", () => store.listImportBatches());
  ipcMain.handle("focus:preview", () => dependencies.importer.preview());
  ipcMain.handle("focus:preview-path", (_event, value) =>
    dependencies.importer.previewPath(z.string().min(1).parse(value)),
  );
  ipcMain.handle(
    "focus:confirm",
    mutation("focus", (token) => {
      const result = dependencies.importer.confirm(idSchema.parse(token));
      if (Notification.isSupported()) {
        new Notification({
          title: "番茄 TODO 导入完成",
          body: `新增 ${result.importedCount} 条，更新 ${result.updatedCount} 条，跳过 ${result.skippedCount} 条`,
        }).show();
      }
      return result;
    }),
  );
  ipcMain.handle(
    "focus:rollback",
    mutation("focus", (id) => store.rollbackImportBatch(idSchema.parse(id))),
  );

  ipcMain.handle("sleep:events", () => store.listLifeEvents());
  ipcMain.handle(
    "sleep:save",
    mutation("sleep", (value) =>
      store.saveLifeEvent(lifeEventDraftSchema.parse(value)),
    ),
  );
  ipcMain.handle(
    "sleep:remove",
    mutation("sleep", (id) => store.removeLifeEvent(idSchema.parse(id))),
  );

  ipcMain.handle("dashboard:summary", () => store.dashboardSummary());
  ipcMain.handle("search:query", (_event, value) =>
    store.search(z.string().max(300).parse(value)),
  );
  ipcMain.handle("backup:export", () => dependencies.backup.exportBackup());
  ipcMain.handle(
    "backup:restore",
    mutation("all", () => dependencies.backup.restoreBackup()),
  );
  ipcMain.handle(
    "backup:restore-path",
    mutation("all", (value) =>
      dependencies.backup.restoreFromPath(z.string().min(1).parse(value)),
    ),
  );
  ipcMain.handle("settings:get", () => store.getSettings());
  ipcMain.handle(
    "settings:set",
    mutation("settings", (value) => {
      const settings = settingsSchema.parse(value);
      store.saveSettings(settings);
      nativeTheme.themeSource = settings.themeMode;
      dependencies.applyUiScale(settings.uiScale);
    }),
  );
  ipcMain.handle(
    "settings:set-ui-scale",
    mutation("settings", (value) => {
      const uiScale = uiScaleSchema.parse(value);
      store.saveUiScale(uiScale);
      dependencies.applyUiScale(uiScale);
    }),
  );
  ipcMain.handle("updates:get-state", () => dependencies.updates.getState());
  ipcMain.handle("updates:check", () =>
    dependencies.updates.check(dependencies.packaged),
  );
  ipcMain.handle("updates:download", () => dependencies.updates.download());
  ipcMain.handle("updates:install", () => dependencies.updates.install());
  ipcMain.handle("sync:get-state", () => ({
    status: "deferred" as const,
    message: "本地完整版本验收后启用 Supabase schema 6 同步。",
  }));
}
