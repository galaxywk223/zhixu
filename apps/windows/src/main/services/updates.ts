import type { BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import type { UpdateState } from "../../preload/api-types";

export class UpdateService {
  private state: UpdateState = {
    status: "idle",
    version: null,
    progress: 0,
    message: null,
  };

  constructor(private readonly getWindow: () => BrowserWindow | null) {
    autoUpdater.autoDownload = false;
    autoUpdater.on("checking-for-update", () =>
      this.setState({ status: "checking" }),
    );
    autoUpdater.on("update-not-available", () =>
      this.setState({ status: "current", progress: 0 }),
    );
    autoUpdater.on("update-available", (info) =>
      this.setState({ status: "available", version: info.version }),
    );
    autoUpdater.on("download-progress", (progress) =>
      this.setState({
        status: "downloading",
        progress: Math.round(progress.percent),
      }),
    );
    autoUpdater.on("update-downloaded", (info) =>
      this.setState({
        status: "downloaded",
        version: info.version,
        progress: 100,
      }),
    );
    autoUpdater.on("error", (error) =>
      this.setState({ status: "error", message: error.message }),
    );
  }

  getState(): UpdateState {
    return { ...this.state };
  }

  async check(packaged: boolean): Promise<UpdateState> {
    if (!packaged) {
      this.setState({ status: "current", message: "开发构建不检查更新" });
      return this.getState();
    }
    await autoUpdater.checkForUpdates();
    return this.getState();
  }

  async download(): Promise<void> {
    await autoUpdater.downloadUpdate();
  }

  install(): void {
    autoUpdater.quitAndInstall(false, true);
  }

  private setState(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch };
    this.getWindow()?.webContents.send("updates:state", this.state);
  }
}
