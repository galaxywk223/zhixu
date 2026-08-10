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

  it("keeps refunded originals and family-card merchant purchases", () => {
    expect(
      classifyFinanceTransaction({
        platform: "alipay",
        rawFlow: "支出",
        rawStatus: "已全额退款",
        rawType: "餐饮美食",
        counterparty: "校园餐厅",
        description: "午餐",
        paymentMethod: "余额",
        isRefundedOriginal: true,
      }),
    ).toMatchObject({
      analysisKind: "expense",
      category: "餐饮",
      isIncluded: true,
      impactReason: "expense",
    });
    expect(
      classifyFinanceTransaction({
        platform: "alipay",
        rawFlow: "不计收支",
        rawStatus: "交易成功",
        rawType: "交通出行",
        counterparty: "地铁",
        description: "乘车码",
        paymentMethod: "亲情卡(永联)",
      }),
    ).toMatchObject({
      analysisKind: "expense",
      category: "交通",
      isIncluded: true,
    });
  });

  it("does not classify merchant purchases from their payment method", () => {
    for (const paymentMethod of ["零钱通", "余额宝", "亲属卡"]) {
      expect(
        classifyFinanceTransaction({
          platform: paymentMethod === "余额宝" ? "alipay" : "wechat",
          rawFlow: "支出",
          rawStatus: "支付成功",
          rawType: "商户消费",
          counterparty: "市人民医院",
          description: "门诊缴费",
          paymentMethod,
        }),
      ).toMatchObject({ analysisKind: "expense", isIncluded: true });
    }
  });

  it("keeps failed records enabled with zero impact", () => {
    for (const [rawType, rawStatus, reason] of [
      ["商户消费", "交易关闭", "failed_or_closed"],
      ["花呗还款", "还款失败", "failed_or_closed"],
      ["信用卡还款", "还款成功", "repayment"],
    ] as const) {
      const result = classifyFinanceTransaction({
        platform: "alipay",
        rawFlow: "支出",
        rawStatus,
        rawType,
        counterparty: "支付宝",
        description: rawType,
        paymentMethod: "余额",
      });
      expect(result).toMatchObject({
        analysisKind: "neutral",
        isIncluded: true,
        impactReason: reason,
      });
      expect(financeImpactCents(result.analysisKind, 2110)).toBe(0);
    }
  });

  it("keeps internal movements at zero while transfer refunds offset once", () => {
    for (const description of [
      "零钱提现",
      "银行卡充值零钱",
      "零钱转零钱通",
      "零钱通转零钱",
      "余额宝自动转入",
      "基金卖出至余额宝",
    ]) {
      expect(
        classifyFinanceTransaction({
          platform: description.includes("余额宝") ? "alipay" : "wechat",
          rawFlow: "/",
          rawStatus: "已完成",
          rawType: description,
          counterparty: "本人账户",
          description,
          paymentMethod: "银行卡",
        }),
      ).toMatchObject({
        analysisKind: "neutral",
        isIncluded: true,
        impactReason: "internal_transfer",
      });
    }

    const original = classifyFinanceTransaction({
      platform: "wechat",
      rawFlow: "支出",
      rawStatus: "对方已退还",
      rawType: "转账",
      counterparty: "朋友",
      description: "转账",
      paymentMethod: "零钱",
    });
    const refund = classifyFinanceTransaction({
      platform: "wechat",
      rawFlow: "收入",
      rawStatus: "已退款",
      rawType: "转账-退款",
      counterparty: "朋友",
      description: "转账退款",
      paymentMethod: "零钱",
    });
    expect(financeImpactCents(original.analysisKind, 10_000)).toBe(10_000);
    expect(financeImpactCents(refund.analysisKind, 10_000)).toBe(-10_000);
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
