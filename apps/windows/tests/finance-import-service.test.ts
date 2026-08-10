// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import iconv from "iconv-lite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initializeDatabase } from "../src/main/database";
import { FinanceImportService } from "../src/main/services/finance-import";
import { ZhixuStore } from "../src/main/store";

vi.mock("electron", () => ({
  dialog: { showOpenDialog: vi.fn() },
}));

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function setup() {
  const root = mkdtempSync(join(tmpdir(), "zhixu-finance-test-"));
  directories.push(root);
  const context = initializeDatabase({
    source: join(root, "missing.sqlite"),
    target: join(root, "data", "zhixu.sqlite"),
    backups: join(root, "backups"),
  });
  const store = new ZhixuStore(context.db, "finance-test-device");
  return {
    root,
    context,
    store,
    service: new FinanceImportService(store),
  };
}

function writeAlipay(path: string): void {
  const header = [
    "交易时间",
    "交易分类",
    "交易对方",
    "对方账号",
    "商品说明",
    "收/支",
    "金额",
    "收/付款方式",
    "交易状态",
    "交易订单号",
    "商家订单号",
    "备注",
  ].join(",");
  const rows = [
    [
      "2026-08-09 12:00:00",
      "餐饮美食",
      "校园餐厅",
      "",
      "午餐",
      "支出",
      "100.00",
      "余额",
      "交易关闭",
      "order-a",
      "merchant-a",
      "",
    ],
    [
      "2026-08-09 12:30:00",
      "退款",
      "校园餐厅",
      "",
      "午餐退款",
      "不计收支",
      "30.00",
      "余额",
      "退款成功",
      "order-a_merchant-a",
      "merchant-a",
      "",
    ],
    [
      "2026-08-10 08:00:00",
      "交通出行",
      "城市地铁",
      "",
      "乘车码",
      "不计收支",
      "25.00",
      "亲属卡",
      "交易成功",
      "order-b",
      "merchant-b",
      "",
    ],
    [
      "2026-08-10 09:00:00",
      "转账红包",
      "妈妈",
      "parent@example.com",
      "生活费",
      "收入",
      "5000.00",
      "余额",
      "交易成功",
      "order-c",
      "",
      "生活费",
    ],
    [
      "2026-08-10 10:00:00",
      "购物",
      "测试商店",
      "",
      "失败订单",
      "支出",
      "12.00",
      "余额",
      "交易失败",
      "order-d",
      "merchant-d",
      "",
    ],
  ].map((row) => row.join(","));
  const content = [
    "支付宝交易明细",
    ...Array.from({ length: 22 }, (_, index) => `说明${index + 1}`),
    header,
    ...rows,
  ].join("\r\n");
  writeFileSync(path, iconv.encode(content, "gb18030"));
}

async function writeWechat(path: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  for (let row = 1; row <= 17; row += 1)
    sheet.getCell(row, 1).value = `微信支付账单 ${row}`;
  const headers = [
    "交易时间",
    "交易类型",
    "交易对方",
    "商品",
    "收/支",
    "金额(元)",
    "支付方式",
    "当前状态",
    "交易单号",
    "商户单号",
    "备注",
  ];
  sheet.getRow(18).values = headers;
  sheet.getRow(19).values = [
    46244.77125,
    "商户消费",
    "早餐店",
    "早餐",
    "支出",
    "¥18.50",
    "零钱",
    "支付成功",
    "wx-a",
    "wx-merchant-a",
    "",
  ];
  sheet.getCell(19, 1).numFmt = "yyyy-mm-dd hh:mm:ss";
  sheet.getRow(20).values = [
    "2026-08-10 11:00:00",
    "转账",
    "朋友",
    "转账",
    "支出",
    "¥20.00",
    "零钱",
    "已转账",
    "wx-b",
    "",
    "AA",
  ];
  sheet.getRow(21).values = [
    46244.0208333333,
    "商户消费",
    "夜间便利店",
    "饮用水",
    "支出",
    "¥1.00",
    "零钱通",
    "支付成功",
    "wx-c",
    "wx-merchant-c",
    "",
  ];
  sheet.getCell(21, 1).numFmt = "yyyy-mm-dd hh:mm:ss";
  await workbook.xlsx.writeFile(path);
}

describe("finance import service", () => {
  it("parses GB18030 Alipay and dynamic-header WeChat bills idempotently", async () => {
    const { root, context, store, service } = setup();
    const alipay = join(root, "alipay.csv");
    const wechat = join(root, "wechat.xlsx");
    writeAlipay(alipay);
    await writeWechat(wechat);

    const preview = await service.previewPaths([alipay, wechat]);
    expect(preview.counts).toEqual({
      source: 8,
      create: 8,
      duplicate: 0,
      excluded: 0,
      positive: 4,
      negative: 2,
      zero: 2,
      error: 0,
    });
    expect(
      preview.rows.find((row) => row.transactionId === "order-a"),
    ).toMatchObject({ analysisKind: "neutral", isIncluded: true });
    expect(
      preview.rows.find((row) => row.transactionId === "order-a")?.transactedAt,
    ).toBe(new Date(2026, 7, 9, 12, 0, 0).toISOString());
    expect(
      preview.rows.find((row) => row.transactionId === "order-a_merchant-a"),
    ).toMatchObject({ analysisKind: "refund", amountCents: 3000 });
    expect(
      preview.rows.find((row) => row.paymentMethod === "亲属卡"),
    ).toMatchObject({ analysisKind: "expense", category: "交通" });
    expect(
      preview.rows.find((row) => row.transactionId === "wx-a")?.transactedAt,
    ).toBe(new Date(2026, 7, 10, 18, 30, 36).toISOString());
    expect(
      preview.rows.find((row) => row.transactionId === "wx-a")?.reason,
    ).toBeNull();
    expect(
      preview.rows.find((row) => row.transactionId === "wx-c"),
    ).toMatchObject({
      transactedAt: new Date(2026, 7, 10, 0, 30, 0).toISOString(),
      analysisKind: "expense",
      isIncluded: true,
    });

    expect(service.confirm(preview.token)).toMatchObject({
      importedCount: 8,
      duplicateCount: 0,
    });
    const all = store.listFinance({ view: "all" });
    expect(all.metrics.netCents).toBe(-496550);
    expect(all.totalCount).toBe(8);

    const parent = all.records.find((row) => row.counterparty === "妈妈")!;
    store.updateFinance({
      id: parent.id,
      isIncluded: false,
      category: "转账往来",
      note: "父母生活费不计入消费",
    });
    const duplicatePreview = await service.previewPaths([wechat, alipay]);
    expect(duplicatePreview.counts.duplicate).toBe(8);
    expect(service.confirm(duplicatePreview.token).importedCount).toBe(0);
    const updated = store.listFinance({ view: "all", search: "妈妈" })
      .records[0]!;
    expect(updated).toMatchObject({
      isIncluded: false,
      category: "转账往来",
      note: "父母生活费不计入消费",
    });
    expect(store.listFinance({ view: "all" }).metrics.netCents).toBe(3450);
    expect(store.listFinance({ view: "all", impact: "zero" }).totalCount).toBe(
      3,
    );
    context.db.close();
  });

  it("rolls back every file when one insert fails", async () => {
    const { root, context, store, service } = setup();
    const alipay = join(root, "alipay.csv");
    const wechat = join(root, "wechat.xlsx");
    writeAlipay(alipay);
    await writeWechat(wechat);
    const preview = await service.previewPaths([alipay, wechat]);
    context.db.exec(`
      CREATE TRIGGER reject_finance_import BEFORE INSERT ON finance_transactions
      WHEN NEW.counterparty = '早餐店'
      BEGIN SELECT RAISE(ABORT, 'reject finance import'); END;
    `);
    expect(() => service.confirm(preview.token)).toThrow(
      "reject finance import",
    );
    expect(store.listFinance({ view: "all" }).totalCount).toBe(0);
    expect(store.listFinanceImportBatches()).toHaveLength(0);
    context.db.close();
  });
});
