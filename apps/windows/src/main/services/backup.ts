import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { dialog } from "electron";
import JSZip from "jszip";
import {
  backupManifestV6Schema,
  backupManifestV7Schema,
  backupManifestV8Schema,
  backupManifestV9Schema,
  type BackupManifestV9,
} from "@zhixu/contracts";
import { ZhixuStore } from "../store";

export class BackupService {
  constructor(
    private readonly store: ZhixuStore,
    private readonly appVersion: string,
  ) {}

  async exportBackup(): Promise<string | null> {
    const result = await dialog.showSaveDialog({
      title: "导出知序备份",
      defaultPath: `zhixu-backup-${new Date().toISOString().slice(0, 10)}.zip`,
      filters: [{ name: "知序备份", extensions: ["zip"] }],
    });
    if (result.canceled || !result.filePath) return null;
    await this.writeBackup(result.filePath);
    return result.filePath;
  }

  async createAutomaticBackup(directory: string): Promise<string> {
    await mkdir(directory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const path = join(directory, `before-sync-${stamp}.zip`);
    await this.writeBackup(path);
    await this.verifyBackup(path);
    return path;
  }

  private async writeBackup(path: string): Promise<void> {
    const payload = JSON.stringify(this.store.exportData());
    const payloadSha256 = createHash("sha256").update(payload).digest("hex");
    const manifest: BackupManifestV9 = {
      schemaVersion: 9,
      appVersion: this.appVersion,
      exportedAt: new Date().toISOString(),
      payloadFile: "data.json",
      payloadSha256,
      entityCounts: this.store.entityCounts(),
    };
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    zip.file("data.json", payload);
    await writeFile(
      path,
      await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
    );
  }

  private async verifyBackup(path: string): Promise<void> {
    const zip = await JSZip.loadAsync(await readFile(path));
    const manifest = backupManifestV9Schema.parse(
      JSON.parse(await zip.file("manifest.json")!.async("string")),
    );
    const payload = await zip.file(manifest.payloadFile)!.async("string");
    const digest = createHash("sha256").update(payload).digest("hex");
    if (digest !== manifest.payloadSha256)
      throw new Error("同步前备份校验失败");
  }

  async restoreBackup(): Promise<boolean> {
    const result = await dialog.showOpenDialog({
      title: "恢复知序备份",
      properties: ["openFile"],
      filters: [{ name: "知序备份", extensions: ["zip"] }],
    });
    if (result.canceled || result.filePaths.length !== 1) return false;
    const filePath = result.filePaths[0];
    if (!filePath) return false;
    return this.restoreFromPath(filePath);
  }

  async restoreFromPath(filePath: string): Promise<boolean> {
    if (!filePath.toLocaleLowerCase().endsWith(".zip"))
      throw new Error("拖放文件必须是 .zip 备份");
    const zip = await JSZip.loadAsync(await readFile(filePath));
    const manifestEntry = zip.file("manifest.json");
    if (!manifestEntry)
      throw new Error(`${basename(filePath)} 缺少 manifest.json`);
    const rawManifest = JSON.parse(
      await manifestEntry.async("string"),
    ) as Record<string, unknown>;
    const current = this.store.exportData();
    try {
      if (
        rawManifest.schemaVersion === 6 ||
        rawManifest.schemaVersion === 7 ||
        rawManifest.schemaVersion === 8 ||
        rawManifest.schemaVersion === 9
      ) {
        const manifest =
          rawManifest.schemaVersion === 9
            ? backupManifestV9Schema.parse(rawManifest)
            : rawManifest.schemaVersion === 8
              ? backupManifestV8Schema.parse(rawManifest)
              : rawManifest.schemaVersion === 7
                ? backupManifestV7Schema.parse(rawManifest)
                : backupManifestV6Schema.parse(rawManifest);
        const payloadEntry = zip.file(manifest.payloadFile);
        if (!payloadEntry) throw new Error("备份缺少 data.json");
        const payloadText = await payloadEntry.async("string");
        const digest = createHash("sha256").update(payloadText).digest("hex");
        if (digest !== manifest.payloadSha256)
          throw new Error("备份数据 SHA-256 校验失败");
        this.store.restoreData(
          JSON.parse(payloadText) as Record<string, unknown>,
        );
      } else {
        const version = Number(rawManifest.schema_version);
        if (![1, 2, 3, 4, 5].includes(version))
          throw new Error("不支持的备份版本");
        this.store.restoreData(rawManifest);
      }
      this.store.rebuildSyncOutbox(current);
      if (this.store.integrityCheck() !== "ok")
        throw new Error("恢复后的数据库完整性检查失败");
      return true;
    } catch (error) {
      this.store.restoreData(current);
      this.store.rebuildSyncOutbox();
      throw error;
    }
  }
}
