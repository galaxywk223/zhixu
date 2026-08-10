import { describe, expect, it } from "vitest";
import {
  classifyFinanceTransaction,
  financeImpactCents,
  parseAmountCents,
} from "../src/shared/finance";
import {
  defaultFinanceFilters,
  financeQueryForFilters,
  formatFinanceCents,
} from "../src/renderer/src/pages/finance-workspace-model";

describe("finance business rules", () => {
  it("uses integer cents and signed net-consumption impact", () => {
    expect(parseAmountCents("¥1,234.56")).toBe(123456);
    expect(parseAmountCents("(20.00)")).toBe(2000);
    expect(financeImpactCents("expense", 1250)).toBe(1250);
    expect(financeImpactCents("transfer_out", 1250)).toBe(1250);
    expect(financeImpactCents("refund", 1250)).toBe(-1250);
    expect(financeImpactCents("income", 1250)).toBe(-1250);
    expect(financeImpactCents("neutral", 1250)).toBe(0);
    expect(financeImpactCents("expense", 1250, false)).toBe(0);
    expect(formatFinanceCents(-123456)).toBe("-¥1,234.56");
  });

  it("keeps refunded originals and relative-card merchant purchases", () => {
    expect(
      classifyFinanceTransaction({
        platform: "alipay",
        rawFlow: "支出",
        rawStatus: "交易关闭",
        rawType: "餐饮美食",
        counterparty: "校园餐厅",
        description: "午餐",
        paymentMethod: "余额",
        isRefundedOriginal: true,
      }),
    ).toEqual({ analysisKind: "expense", category: "餐饮", isIncluded: true });
    expect(
      classifyFinanceTransaction({
        platform: "alipay",
        rawFlow: "不计收支",
        rawStatus: "交易成功",
        rawType: "交通出行",
        counterparty: "地铁",
        description: "乘车码",
        paymentMethod: "亲属卡",
      }),
    ).toEqual({ analysisKind: "expense", category: "交通", isIncluded: true });
  });

  it("separates personal transfers from internal account flows", () => {
    expect(
      classifyFinanceTransaction({
        platform: "wechat",
        rawFlow: "支出",
        rawStatus: "支付成功",
        rawType: "转账",
        counterparty: "朋友",
        description: "转账",
        paymentMethod: "零钱",
      }),
    ).toMatchObject({ analysisKind: "transfer_out", isIncluded: true });
    expect(
      classifyFinanceTransaction({
        platform: "wechat",
        rawFlow: "/",
        rawStatus: "已完成",
        rawType: "零钱提现",
        counterparty: "微信零钱",
        description: "提现",
        paymentMethod: "零钱",
      }),
    ).toMatchObject({
      analysisKind: "neutral",
      category: "资金流转",
      isIncluded: true,
    });
  });

  it("builds a persisted month query without persisting detail filters", () => {
    const filters = defaultFinanceFilters(new Date(2026, 7, 11));
    expect(filters.view).toBe("month");
    expect(financeQueryForFilters(filters, { search: "餐厅" })).toMatchObject({
      view: "month",
      search: "餐厅",
      inclusion: "all",
      sort: "time_desc",
    });
  });
});
