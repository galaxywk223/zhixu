import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { dialog } from "electron";
import { spawn } from "node:child_process";
import type { ImportResult, TomatoPreview } from "../../preload/api-types";
import { ZhixuStore } from "../store";

interface RawTomatoSession {
  source_key: string;
  legacy_source_key?: string;
  start_local: string;
  end_local: string;
  task_name?: string;
  duration_minutes?: number;
  reflection?: string;
  status?: string;
}

interface RawTomatoPayload {
  schema_version: number;
  source: string;
  file_hash?: string;
  export_user?: string;
  declared_minutes?: number;
  declared_records?: number;
  range_start?: string;
  range_end?: string;
  sessions?: RawTomatoSession[];
}

function localToIso(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    throw new Error(`番茄记录包含无效时间：${value}`);
  return parsed.toISOString();
}

export class TomatoImportService {
  private readonly pending = new Map<string, TomatoPreview>();

  constructor(
    private readonly store: ZhixuStore,
    private readonly resourcesPath: string,
    private readonly projectRoot: string,
    private readonly packaged: boolean,
  ) {}

  async preview(): Promise<TomatoPreview | null> {
    const result = await dialog.showOpenDialog({
      title: "导入番茄 TODO",
      properties: ["openFile"],
      filters: [{ name: "番茄 TODO 导出", extensions: ["xls"] }],
    });
    if (result.canceled || result.filePaths.length !== 1) return null;
    const filePath = result.filePaths[0];
    if (!filePath) return null;
    return this.previewPath(filePath);
  }

  async previewPath(filePath: string): Promise<TomatoPreview> {
    if (
      !filePath.toLocaleLowerCase().endsWith(".xls") ||
      !existsSync(filePath)
    ) {
      throw new Error("拖放文件必须是存在的 .xls 文件");
    }
    const executable = this.resolveExecutable();
    const stdout = await this.run(executable, filePath);
    const raw = JSON.parse(stdout) as RawTomatoPayload;
    if (raw.schema_version !== 3 || raw.source !== "tomatodo")
      throw new Error("不支持的番茄 TODO 解析结果");
    const token = randomUUID();
    const bytes = await readFile(filePath);
    const preview: TomatoPreview = {
      token,
      fileName: basename(filePath),
      fileHash: createHash("sha256").update(bytes).digest("hex"),
      exportUser: raw.export_user ?? null,
      declaredMinutes: raw.declared_minutes ?? null,
      declaredRecords: raw.declared_records ?? null,
      rangeStart: localToIso(raw.range_start),
      rangeEnd: localToIso(raw.range_end),
      sessions: (raw.sessions ?? []).map((session) => ({
        sourceKey: session.source_key,
        legacySourceKey: session.legacy_source_key ?? null,
        startAt: localToIso(session.start_local) ?? new Date(0).toISOString(),
        endAt: localToIso(session.end_local) ?? new Date(0).toISOString(),
        taskName: session.task_name ?? "",
        durationMinutes: session.duration_minutes ?? 0,
        reflection: session.reflection ?? null,
        status: session.status ?? "",
      })),
    };
    this.pending.set(token, preview);
    return preview;
  }

  confirm(token: string): ImportResult {
    const preview = this.pending.get(token);
    if (!preview) throw new Error("导入预览已失效，请重新选择文件");
    this.pending.delete(token);
    return this.store.importTomato(preview);
  }

  private resolveExecutable(): string {
    const candidates = this.packaged
      ? [join(this.resourcesPath, "native", "zhixu_tomatodo_importer.exe")]
      : [
          join(
            this.projectRoot,
            "native",
            "tomatodo_importer",
            "target",
            "release",
            "zhixu_tomatodo_importer.exe",
          ),
          join(
            this.projectRoot,
            "native",
            "tomatodo_importer",
            "target",
            "debug",
            "zhixu_tomatodo_importer.exe",
          ),
        ];
    const executable = candidates.find((candidate) => existsSync(candidate));
    if (!executable)
      throw new Error("未找到番茄 TODO 解析器，请先执行 Rust release 构建");
    return executable;
  }

  private run(executable: string, filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, [filePath], { windowsHide: true });
      let stdout = "";
      let stderr = "";
      child.stdout
        .setEncoding("utf8")
        .on("data", (chunk: string) => (stdout += chunk));
      child.stderr
        .setEncoding("utf8")
        .on("data", (chunk: string) => (stderr += chunk));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve(stdout);
        else
          reject(new Error(stderr.trim() || `番茄 TODO 解析器退出码：${code}`));
      });
    });
  }
}
