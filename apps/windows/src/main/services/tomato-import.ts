import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { dialog } from "electron";
import { spawn } from "node:child_process";
import type { ImportResult, TomatoPreview } from "../../preload/api-types";
import { ZhixuStore } from "../store";

interface RawTomatoRow {
  source_row: number;
  source_key?: string;
  legacy_source_key?: string;
  start_local?: string;
  end_local?: string;
  task_name?: string;
  duration_minutes?: number;
  reflection?: string;
  status?: string;
  classification?: "focus" | "life_event" | "excluded" | "error";
  reason?: string;
  warnings?: string[];
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
  rows?: RawTomatoRow[];
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
    if (raw.schema_version !== 4 || raw.source !== "tomatodo")
      throw new Error("不支持的番茄 TODO 解析结果");
    const token = randomUUID();
    const bytes = await readFile(filePath);
    const rows = (raw.rows ?? []).map((row) => ({
      sourceRow: row.source_row,
      sourceKey: row.source_key ?? null,
      legacySourceKey: row.legacy_source_key ?? null,
      startAt: localToIso(row.start_local),
      endAt: localToIso(row.end_local),
      taskName: row.task_name ?? "",
      durationMinutes: row.duration_minutes ?? null,
      reflection: row.reflection ?? null,
      status: row.status ?? "",
      classification: row.classification ?? ("error" as const),
      action: "error" as const,
      reason: row.reason ?? null,
      warnings: row.warnings ?? [],
    }));
    const parsed: TomatoPreview = {
      token,
      fileName: basename(filePath),
      fileHash: createHash("sha256").update(bytes).digest("hex"),
      exportUser: raw.export_user ?? null,
      declaredMinutes: raw.declared_minutes ?? null,
      declaredRecords: raw.declared_records ?? null,
      rangeStart: localToIso(raw.range_start),
      rangeEnd: localToIso(raw.range_end),
      calculatedMinutes: rows
        .filter((row) => row.classification === "focus")
        .reduce((sum, row) => sum + Math.max(0, row.durationMinutes ?? 0), 0),
      focusCount: rows.filter((row) => row.classification === "focus").length,
      lifeEventCount: rows.filter((row) => row.classification === "life_event")
        .length,
      counts: {
        create: 0,
        update: 0,
        unchanged: 0,
        reconcile: 0,
        excluded: 0,
        error: 0,
      },
      canCommit: false,
      rows,
    };
    const preview = this.store.previewTomatoImport(parsed);
    this.pending.set(token, preview);
    return preview;
  }

  confirm(token: string): ImportResult {
    const preview = this.pending.get(token);
    if (!preview) throw new Error("导入预览已失效，请重新选择文件");
    const result = this.store.importTomato(preview);
    this.pending.delete(token);
    return result;
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
