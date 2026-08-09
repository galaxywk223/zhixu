import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { UiScale } from "@zhixu/contracts";
import {
  app,
  BrowserWindow,
  Menu,
  nativeTheme,
  session,
  shell,
  Tray,
} from "electron";
import log from "electron-log/main";
import { initializeDatabase } from "./database";
import { registerIpc } from "./ipc";
import { BackupService } from "./services/backup";
import { TomatoImportService } from "./services/tomato-import";
import { UpdateService } from "./services/updates";
import { ZhixuStore } from "./store";

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
app.setAppUserModelId("com.galaxywk.zhixu.desktop");
log.initialize();

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let forceQuit = false;
let closeToTray = true;
let currentUiScale: UiScale = 100;

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
  const icon = app.isPackaged
    ? join(process.resourcesPath, "zhixu.ico")
    : resolve("resources/zhixu.ico");
  mainWindow = new BrowserWindow({
    ...state,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1C2025" : "#F7F9FC",
    icon: existsSync(icon) ? icon : undefined,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
    },
  });
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
  app.on("second-instance", () => sendNavigation("today"));
  app
    .whenReady()
    .then(async () => {
      const context = initializeDatabase();
      const store = new ZhixuStore(context.db);
      const settings = store.getSettings();
      closeToTray = settings.closeToTray;
      currentUiScale = settings.uiScale;
      nativeTheme.themeSource = settings.themeMode;
      if (process.argv.includes("--self-test")) {
        const focusSessions = store.listFocusSessions();
        process.stdout.write(
          `${JSON.stringify({
            schemaVersion: 6,
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
      const projectRoot = resolve(__dirname, "../../../..");
      const importer = new TomatoImportService(
        store,
        process.resourcesPath,
        projectRoot,
        app.isPackaged,
      );
      registerIpc({
        store,
        migration: context.report,
        version: app.getVersion(),
        getWindow: () => mainWindow,
        backup,
        importer,
        updates,
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
      await createWindow();
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

app.on("before-quit", () => (forceQuit = true));
app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && forceQuit) app.quit();
});
