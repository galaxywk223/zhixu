import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { UiScale } from "@zhixu/contracts";
import {
  app,
  BrowserWindow,
  Menu,
  nativeImage,
  nativeTheme,
  session,
  shell,
  Tray,
} from "electron";
import log from "electron-log/main";
import { initializeDatabase } from "./database";
import { registerIpc } from "./ipc";
import { BackupService } from "./services/backup";
import {
  EncryptedSessionStorage,
  loadDeviceId,
} from "./services/secure-storage";
import { SyncService } from "./services/sync";
import { DailyQuoteService } from "./services/daily-quotes";
import { SyncRepository } from "./services/sync-repository";
import { FinanceImportService } from "./services/finance-import";
import { TomatoImportService } from "./services/tomato-import";
import { UpdateService } from "./services/updates";
import { ZhixuStore } from "./store";
import { appUserModelId, resolveAppIconPath } from "../shared/app-identity";

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized?: boolean;
}

const localData = process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, "Zhixu")
  : app.getPath("userData");
app.setPath("userData", localData);
app.setName("知序");
app.setAppUserModelId(appUserModelId(app.isPackaged));
log.initialize();

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let forceQuit = false;
let closeToTray = true;
let currentUiScale: UiScale = 100;
let syncService: SyncService | null = null;
let pendingAuthUrl: string | null = null;

function authUrlFromArguments(arguments_: string[]): string | null {
  return arguments_.find((value) => value.startsWith("zhixu://auth/")) ?? null;
}

function handleAuthUrl(url: string): void {
  if (!syncService) {
    pendingAuthUrl = url;
    return;
  }
  void syncService
    .handleAuthCallback(url)
    .then(() => sendNavigation("settings-sync"))
    .catch((error: unknown) =>
      log.error("Authentication callback failed", error),
    );
}

function statePath(): string {
  return join(app.getPath("userData"), "window-state.json");
}

function loadWindowState(): WindowState {
  try {
    const parsed = JSON.parse(readFileSync(statePath(), "utf8")) as WindowState;
    return {
      width: Math.max(1080, parsed.width || 1440),
      height: Math.max(680, parsed.height || 900),
      x: parsed.x,
      y: parsed.y,
      maximized: parsed.maximized,
    };
  } catch {
    return { width: 1440, height: 900 };
  }
}

function saveWindowState(window: BrowserWindow): void {
  const maximized = window.isMaximized();
  const bounds = maximized ? window.getNormalBounds() : window.getBounds();
  writeFileSync(statePath(), JSON.stringify({ ...bounds, maximized }), "utf8");
}

function sendNavigation(route: string): void {
  if (!mainWindow) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send("app:navigate", route);
}

async function createWindow(): Promise<void> {
  const state = loadWindowState();
  const iconPath = resolveAppIconPath({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    workingDirectory: process.cwd(),
  });
  const icon = nativeImage.createFromPath(iconPath);
  if (!existsSync(iconPath) || icon.isEmpty())
    throw new Error(`知序图标加载失败：${iconPath}`);
  mainWindow = new BrowserWindow({
    ...state,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1C2025" : "#F7F9FC",
    icon,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
    },
  });
  mainWindow.setIcon(icon);
  mainWindow.webContents.setZoomFactor(currentUiScale / 100);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/(github\.com|supabase\.com)\//.test(url))
      void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("close", (event) => {
    if (!forceQuit && closeToTray) {
      event.preventDefault();
      mainWindow?.hide();
      return;
    }
    if (mainWindow) saveWindowState(mainWindow);
  });
  mainWindow.on("closed", () => (mainWindow = null));
  mainWindow.once("ready-to-show", () => {
    if (state.maximized) mainWindow?.maximize();
    mainWindow?.show();
  });
  if (process.env.ELECTRON_RENDERER_URL)
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));

  tray = new Tray(icon);
  tray.setToolTip("知序");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开知序", click: () => sendNavigation("today") },
      { label: "新建任务", click: () => sendNavigation("new-task") },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          forceQuit = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("double-click", () => sendNavigation("today"));
}

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  if (process.defaultApp && process.argv[1])
    app.setAsDefaultProtocolClient("zhixu", process.execPath, [
      resolve(process.argv[1]),
    ]);
  else app.setAsDefaultProtocolClient("zhixu");
  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleAuthUrl(url);
  });
  app.on("second-instance", (_event, argv) => {
    const authUrl = authUrlFromArguments(argv);
    if (authUrl) handleAuthUrl(authUrl);
    else sendNavigation("today");
  });
  app
    .whenReady()
    .then(async () => {
      const context = initializeDatabase();
      const deviceId = loadDeviceId(app.getPath("userData"));
      const store = new ZhixuStore(context.db, deviceId);
      const settings = store.getSettings();
      closeToTray = settings.closeToTray;
      currentUiScale = settings.uiScale;
      nativeTheme.themeSource = settings.themeMode;
      if (process.argv.includes("--self-test")) {
        const focusSessions = store.listFocusSessions();
        process.stdout.write(
          `${JSON.stringify({
            schemaVersion: 10,
            integrity: store.integrityCheck(),
            migration: context.report,
            counts: store.entityCounts(),
            focusMinutes: focusSessions.reduce(
              (sum, session) => sum + Math.max(0, session.durationMinutes),
              0,
            ),
            sleepEventCount: store.listLifeEvents().length,
          })}\n`,
        );
        context.db.close();
        app.quit();
        return;
      }
      session.defaultSession.setPermissionRequestHandler(
        (_webContents, _permission, callback) => callback(false),
      );
      const updates = new UpdateService(() => mainWindow);
      const backup = new BackupService(store, app.getVersion());
      const syncRepository = new SyncRepository(context.db, deviceId);
      syncService = new SyncService({
        url: __SUPABASE_URL__,
        anonKey: __SUPABASE_ANON_KEY__,
        repository: syncRepository,
        backup,
        storage: new EncryptedSessionStorage(app.getPath("userData")),
        userDataPath: app.getPath("userData"),
        getWindow: () => mainWindow,
        notifyDataChanged: () =>
          mainWindow?.webContents.send("app:data-changed", "all"),
      });
      const dailyQuotes = new DailyQuoteService(store, syncService);
      store.setOutboxChangedListener(() => syncService?.requestSync());
      const projectRoot = resolve(__dirname, "../../../..");
      const importer = new TomatoImportService(
        store,
        process.resourcesPath,
        projectRoot,
        app.isPackaged,
      );
      const financeImporter = new FinanceImportService(store);
      registerIpc({
        store,
        migration: context.report,
        version: app.getVersion(),
        getWindow: () => mainWindow,
        importer,
        financeImporter,
        updates,
        sync: syncService,
        dailyQuotes,
        packaged: app.isPackaged,
        applyUiScale: (uiScale) => {
          currentUiScale = uiScale;
          mainWindow?.webContents.setZoomFactor(currentUiScale / 100);
        },
        applyCloseToTray: (value) => {
          closeToTray = value;
        },
      });
      Menu.setApplicationMenu(null);
      await syncService.initialize();
      await createWindow();
      if (pendingAuthUrl) {
        const url = pendingAuthUrl;
        pendingAuthUrl = null;
        handleAuthUrl(url);
      } else {
        const initialAuthUrl = authUrlFromArguments(process.argv);
        if (initialAuthUrl) handleAuthUrl(initialAuthUrl);
      }
      mainWindow?.on("focus", () => syncService?.requestSync(0));
      if (settings.startMinimized) mainWindow?.hide();
      app.on("activate", () => {
        if (!mainWindow) void createWindow();
        else sendNavigation("today");
      });
    })
    .catch((error: unknown) => {
      log.error("Startup failed", error);
      app.exit(1);
    });
}

app.on("before-quit", () => {
  forceQuit = true;
  syncService?.dispose();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && forceQuit) app.quit();
});
