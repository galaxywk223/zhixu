import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { dialog } from "electron";
import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
import iconv from "iconv-lite";
import type {
  FinanceImportPreview,
  FinanceImportResult,
  FinanceImportRow,
  FinancePreviewFile,
} from "../../preload/api-types";
import {
  classifyFinanceTransaction,
  parseAmountCents,
  type FinancePlatform,
} from "../../shared/finance";
import { ZhixuStore } from "../store";

type RawRow = Record<string, string>;

interface ParsedFile {
  file: FinancePreviewFile;
  rows: FinanceImportRow[];
}

function normalizedRow(value: Record<string, unknown>): RawRow {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key.trim().replace(/^\uFEFF/, ""),
      item == null ? "" : String(item).trim(),
    ]),
  );
}

function localDateTimeToIso(value: string): string {
  const matched = value
    .trim()
    .match(
      /^(\d{4})[-\/]([01]?\d)[-\/]([0-3]?\d)\s+([0-2]?\d):([0-5]?\d)(?::([0-5]?\d))?$/,
    );
  if (!matched) throw new Error(`交易时间无效：${value}`);
  const date = new Date(
    Number(matched[1]),
    Number(matched[2]) - 1,
    Number(matched[3]),
    Number(matched[4]),
    Number(matched[5]),
    Number(matched[6] ?? 0),
  );
  if (Number.isNaN(date.getTime())) throw new Error(`交易时间无效：${value}`);
  return date.toISOString();
}

function stableSourceKey(
  platform: FinancePlatform,
  input: {
    transactionId: string | null;
    merchantOrderId: string | null;
    transactedAt: string;
    rawFlow: string;
    amountCents: number;
    rawType: string;
    counterparty: string;
    description: string;
  },
): string {
  const identity =
    input.transactionId || input.merchantOrderId
      ? [
          platform,
          input.transactionId ?? "",
          input.merchantOrderId ?? "",
          input.transactedAt,
          input.rawFlow,
          input.amountCents,
          input.rawType,
        ]
      : [
          platform,
          input.transactedAt,
          input.rawFlow,
          input.amountCents,
          input.rawType,
          input.counterparty,
          input.description,
        ];
  return createHash("sha256").update(identity.join("\u001f")).digest("hex");
}

function buildImportRow(
  platform: FinancePlatform,
  sourceRow: number,
  fileHash: string,
  raw: RawRow,
  refundedOriginalIds: ReadonlySet<string>,
): FinanceImportRow {
  const transactionId =
    (raw["交易订单号"] || raw["交易单号"] || "").trim() || null;
  const merchantOrderId =
    (raw["商家订单号"] || raw["商户单号"] || "").trim() || null;
  const transactedAt = localDateTimeToIso(raw["交易时间"] ?? "");
  const amountCents = parseAmountCents(raw["金额"] || raw["金额(元)"] || "");
  const rawFlow = raw["收/支"] ?? "";
  const rawStatus = raw["交易状态"] || raw["当前状态"] || "";
  const rawType = raw["交易分类"] || raw["交易类型"] || "";
  const counterparty = raw["交易对方"] ?? "";
  const counterpartyAccount = raw["对方账号"]?.trim() || null;
  const description = raw["商品说明"] || raw["商品"] || "";
  const paymentMethod = raw["收/付款方式"] || raw["支付方式"] || "";
  const rawNote = raw["备注"]?.trim() || null;
  const isRefundedOriginal = [transactionId, merchantOrderId].some(
    (value) => value != null && refundedOriginalIds.has(value),
  );
  const classification = classifyFinanceTransaction({
    platform,
    rawFlow,
    rawStatus,
    rawType,
    counterparty,
    description,
    paymentMethod,
    isRefundedOriginal,
  });
  const sourceKey = stableSourceKey(platform, {
    transactionId,
    merchantOrderId,
    transactedAt,
    rawFlow,
    amountCents,
    rawType,
    counterparty,
    description,
  });
  return {
    sourceRow,
    fileHash,
    platform,
    sourceKey,
    transactionId,
    merchantOrderId,
    transactedAt,
    amountCents,
    rawFlow,
    rawStatus,
    rawType,
    counterparty,
    counterpartyAccount,
    description,
    paymentMethod,
    rawNote,
    rawPayloadJson: JSON.stringify(raw),
    analysisKind: classification.analysisKind,
    category: classification.category,
    isIncluded: classification.isIncluded,
    action: "create",
    reason: classification.isIncluded ? null : "交易未完成或默认不计入",
  };
}

function errorRow(
  platform: FinancePlatform,
  sourceRow: number,
  fileHash: string,
  raw: RawRow,
  error: unknown,
): FinanceImportRow {
  return {
    sourceRow,
    fileHash,
    platform,
    sourceKey: createHash("sha256")
      .update(`${fileHash}:${sourceRow}`)
      .digest("hex"),
    transactionId: null,
    merchantOrderId: null,
    transactedAt: new Date(0).toISOString(),
    amountCents: 0,
    rawFlow: raw["收/支"] ?? "",
    rawStatus: raw["交易状态"] || raw["当前状态"] || "",
    rawType: raw["交易分类"] || raw["交易类型"] || "",
    counterparty: raw["交易对方"] ?? "",
    counterpartyAccount: raw["对方账号"]?.trim() || null,
    description: raw["商品说明"] || raw["商品"] || "",
    paymentMethod: raw["收/付款方式"] || raw["支付方式"] || "",
    rawNote: raw["备注"]?.trim() || null,
    rawPayloadJson: JSON.stringify(raw),
    analysisKind: "neutral",
    category: "其他",
    isIncluded: false,
    action: "error",
    reason: error instanceof Error ? error.message : String(error),
  };
}

function refundedOriginalIds(rows: RawRow[]): Set<string> {
  const result = new Set<string>();
  for (const row of rows) {
    const status = `${row["交易状态"] ?? ""} ${row["当前状态"] ?? ""}`;
    const type = `${row["交易分类"] ?? ""} ${row["交易类型"] ?? ""} ${row["商品说明"] ?? ""} ${row["商品"] ?? ""}`;
    if (!/退款|退回/.test(`${status} ${type}`)) continue;
    const transactionId = row["交易订单号"] || row["交易单号"] || "";
    const merchantOrderId = row["商家订单号"] || row["商户单号"] || "";
    for (const value of [transactionId, merchantOrderId]) {
      const normalized = value.trim();
      if (!normalized) continue;
      result.add(normalized);
      const prefix = normalized.split("_")[0]?.trim();
      if (prefix) result.add(prefix);
    }
  }
  return result;
}

function buildParsedFile(
  fileName: string,
  fileHash: string,
  platform: FinancePlatform,
  rows: Array<{ sourceRow: number; value: RawRow }>,
): ParsedFile {
  const values = rows.map((item) => item.value);
  const refundIds = refundedOriginalIds(values);
  const parsedRows = rows.map(({ sourceRow, value }) => {
    try {
      return buildImportRow(platform, sourceRow, fileHash, value, refundIds);
    } catch (error) {
      return errorRow(platform, sourceRow, fileHash, value, error);
    }
  });
  const validDates = parsedRows
    .filter((row) => row.action !== "error")
    .map((row) => row.transactedAt)
    .sort();
  return {
    file: {
      fileName,
      fileHash,
      platform,
      rangeStart: validDates[0] ?? null,
      rangeEnd: validDates[validDates.length - 1] ?? null,
      sourceCount: rows.length,
      newCount: parsedRows.filter((row) => row.action === "create").length,
      duplicateCount: 0,
      excludedCount: parsedRows.filter((row) => !row.isIncluded).length,
      errorCount: parsedRows.filter((row) => row.action === "error").length,
    },
    rows: parsedRows,
  };
}

function localDateTimeText(value: Date): string {
  const part = (item: number): string => String(item).padStart(2, "0");
  return `${value.getFullYear()}-${part(value.getMonth() + 1)}-${part(value.getDate())} ${part(value.getHours())}:${part(value.getMinutes())}:${part(value.getSeconds())}`;
}

async function parseAlipay(path: string, bytes: Buffer): Promise<ParsedFile> {
  const content = iconv.decode(bytes, "gb18030");
  const lines = content.split(/\r?\n/);
  const headerIndex = lines.findIndex(
    (line) => line.includes("交易时间") && line.includes("交易订单号"),
  );
  if (headerIndex < 0) throw new Error("未识别支付宝账单表头");
  const records = parse(lines.slice(headerIndex).join("\n"), {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Array<Record<string, unknown>>;
  const rows = records
    .map(normalizedRow)
    .filter((row) =>
      /^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s/.test(row["交易时间"] ?? ""),
    )
    .map((value, index) => ({ sourceRow: headerIndex + index + 2, value }));
  if (!rows.length) throw new Error("支付宝账单没有可识别的交易记录");
  const fileHash = createHash("sha256").update(bytes).digest("hex");
  return buildParsedFile(basename(path), fileHash, "alipay", rows);
}

async function parseWechat(path: string, bytes: Buffer): Promise<ParsedFile> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("微信账单缺少工作表");
  let headerRow = 0;
  let headers: string[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (headerRow) return;
    const values = row.values as unknown[];
    const candidate = values
      .slice(1)
      .map((value) => String(value ?? "").trim());
    if (candidate.includes("交易时间") && candidate.includes("交易单号")) {
      headerRow = rowNumber;
      headers = candidate;
    }
  });
  if (!headerRow) throw new Error("未识别微信账单表头");
  const rows: Array<{ sourceRow: number; value: RawRow }> = [];
  for (
    let rowNumber = headerRow + 1;
    rowNumber <= sheet.rowCount;
    rowNumber += 1
  ) {
    const row = sheet.getRow(rowNumber);
    const raw: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      const cell = row.getCell(index + 1);
      raw[header] =
        header === "交易时间" && cell.value instanceof Date
          ? localDateTimeText(cell.value)
          : cell.text;
    });
    const value = normalizedRow(raw);
    if (!/^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s/.test(value["交易时间"] ?? ""))
      continue;
    rows.push({ sourceRow: rowNumber, value });
  }
  if (!rows.length) throw new Error("微信账单没有可识别的交易记录");
  const fileHash = createHash("sha256").update(bytes).digest("hex");
  return buildParsedFile(basename(path), fileHash, "wechat", rows);
}

export class FinanceImportService {
  private readonly pending = new Map<string, FinanceImportPreview>();

  constructor(private readonly store: ZhixuStore) {}

  async preview(): Promise<FinanceImportPreview | null> {
    const result = await dialog.showOpenDialog({
      title: "导入微信或支付宝账单",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "微信与支付宝账单", extensions: ["csv", "xlsx"] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return this.previewPaths(result.filePaths);
  }

  async previewPaths(paths: string[]): Promise<FinanceImportPreview> {
    const uniquePaths = [...new Set(paths)];
    if (!uniquePaths.length) throw new Error("请选择至少一个账单文件");
    const parsed: ParsedFile[] = [];
    for (const path of uniquePaths) {
      if (!existsSync(path))
        throw new Error(`账单文件不存在：${basename(path)}`);
      const extension = extname(path).toLocaleLowerCase();
      const bytes = await readFile(path);
      if (extension === ".csv") parsed.push(await parseAlipay(path, bytes));
      else if (extension === ".xlsx")
        parsed.push(await parseWechat(path, bytes));
      else throw new Error(`不支持的账单格式：${basename(path)}`);
    }
    const token = randomUUID();
    const rows = parsed.flatMap((item) => item.rows);
    const rawPreview: FinanceImportPreview = {
      token,
      files: parsed.map((item) => item.file),
      rows,
      counts: {
        source: rows.length,
        create: rows.filter((row) => row.action === "create").length,
        duplicate: 0,
        excluded: rows.filter((row) => !row.isIncluded).length,
        error: rows.filter((row) => row.action === "error").length,
      },
      canCommit: false,
    };
    const preview = this.store.previewFinanceImport(rawPreview);
    this.pending.set(token, preview);
    return preview;
  }

  confirm(token: string): FinanceImportResult {
    const preview = this.pending.get(token);
    if (!preview) throw new Error("导入预览已失效，请重新选择文件");
    const result = this.store.importFinance(preview);
    this.pending.delete(token);
    return result;
  }
}
