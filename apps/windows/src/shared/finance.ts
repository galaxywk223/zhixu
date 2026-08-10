export const FINANCE_PLATFORMS = ["alipay", "wechat"] as const;
export type FinancePlatform = (typeof FINANCE_PLATFORMS)[number];

export const FINANCE_ANALYSIS_KINDS = [
  "expense",
  "transfer_out",
  "income",
  "refund",
  "neutral",
] as const;
export type FinanceAnalysisKind = (typeof FINANCE_ANALYSIS_KINDS)[number];

export const FINANCE_IMPACT_REASONS = [
  "expense",
  "transfer_out",
  "income",
  "refund",
  "internal_transfer",
  "repayment",
  "failed_or_closed",
] as const;
export type FinanceImpactReason = (typeof FINANCE_IMPACT_REASONS)[number];

export const FINANCE_CATEGORIES = [
  "餐饮",
  "交通",
  "购物",
  "日用",
  "医疗",
  "教育",
  "娱乐",
  "住宿旅行",
  "生活服务",
  "数码",
  "住房",
  "转账往来",
  "退款",
  "资金流转",
  "收入",
  "其他",
] as const;
export type FinanceCategory = (typeof FINANCE_CATEGORIES)[number];

export interface FinanceClassificationInput {
  platform: FinancePlatform;
  rawFlow: string;
  rawStatus: string;
  rawType: string;
  counterparty: string;
  description: string;
  paymentMethod: string;
  isRefundedOriginal?: boolean;
}

export interface FinanceClassification {
  analysisKind: FinanceAnalysisKind;
  category: FinanceCategory;
  isIncluded: boolean;
  impactReason: FinanceImpactReason;
}

const unavailableStatus =
  /失败|关闭|未支付|待支付|处理中|进行中|已撤销|已取消|未完成/;
const refundText = /退款|退回|退款成功|已全额退款|已退款/;
const transferText = /转账|红包|收款|二维码收付款|群收款|AA收款/;
const repaymentText =
  /花呗.{0,12}还款|还款.{0,12}花呗|信用卡.{0,12}还款|还款.{0,12}信用卡/;
const internalTransferText =
  /零钱提现|零钱充值|充值零钱|零钱转零钱通|零钱通转零钱|存入零钱通|转入零钱通|转出零钱通|余额宝自动转入|转入余额宝|转出余额宝|基金买入|基金卖出|理财申购|理财赎回|银行卡转入|银行卡转出|账户互转|余额互转|资金转入|资金转出/;

const categoryRules: Array<[FinanceCategory, RegExp]> = [
  [
    "餐饮",
    /餐饮|外卖|美团|饿了么|餐厅|饭店|食堂|咖啡|奶茶|饮品|小吃|水果|食品/,
  ],
  [
    "交通",
    /交通|地铁|公交|铁路|火车|高铁|滴滴|打车|出租|加油|停车|车票|航空|机票/,
  ],
  ["医疗", /医疗|医院|药房|药店|诊所|挂号|医保|健康/],
  ["教育", /教育|学校|学费|考试|书店|图书|课程|培训|论文|知网/],
  ["住宿旅行", /酒店|宾馆|民宿|旅行|旅游|住宿|携程|同程|去哪儿/],
  ["数码", /数码|电脑|手机|电子|软件|云服务|会员服务|通信|话费|宽带/],
  ["住房", /房租|物业|水费|电费|燃气|住房|公寓/],
  ["娱乐", /娱乐|电影|游戏|演出|视频|音乐|KTV|门票/],
  ["日用", /日用|超市|便利店|百货|生活用品|洗护|纸品/],
  ["生活服务", /生活服务|快递|洗衣|维修|打印|摄影|理发|美容|服务费/],
  ["购物", /购物|淘宝|天猫|京东|拼多多|商店|商城|服饰|鞋|箱包/],
];

export function parseAmountCents(value: string | number): number {
  const normalized = String(value)
    .replace(/[￥¥,\s]/g, "")
    .replace(/^\((.*)\)$/, "-$1");
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized))
    throw new Error(`金额无效：${value}`);
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) throw new Error(`金额无效：${value}`);
  return Math.round(Math.abs(amount) * 100);
}

export function financeImpactCents(
  kind: FinanceAnalysisKind,
  amountCents: number,
  isIncluded = true,
): number {
  if (!isIncluded || kind === "neutral") return 0;
  const amount = Math.max(0, Math.trunc(amountCents));
  return kind === "income" || kind === "refund" ? -amount : amount;
}

function initialCategory(text: string): FinanceCategory {
  for (const [category, pattern] of categoryRules)
    if (pattern.test(text)) return category;
  return "其他";
}

export function classifyFinanceTransaction(
  input: FinanceClassificationInput,
): FinanceClassification {
  const businessText = [
    input.rawType,
    input.counterparty,
    input.description,
  ].join(" ");
  const categoryText = `${businessText} ${input.paymentMethod}`;
  const flow = input.rawFlow.trim();
  const status = input.rawStatus.trim();
  const isUnavailable = unavailableStatus.test(status);
  const isRepayment = repaymentText.test(businessText);
  const isInternalTransfer = internalTransferText.test(businessText);
  const isTransfer = transferText.test(`${input.rawType} ${input.description}`);
  const isRefundIncome =
    !/支出/.test(flow) &&
    refundText.test(`${input.rawType} ${input.description} ${status}`);
  const isFamilyCardPurchase =
    /亲情卡|亲属卡/.test(input.paymentMethod) && !isUnavailable;

  let analysisKind: FinanceAnalysisKind;
  let impactReason: FinanceImpactReason | undefined;
  if (isUnavailable) {
    analysisKind = "neutral";
    impactReason = "failed_or_closed";
  } else if (isRepayment) {
    analysisKind = "neutral";
    impactReason = "repayment";
  } else if (isInternalTransfer) {
    analysisKind = "neutral";
    impactReason = "internal_transfer";
  } else if (isRefundIncome) {
    analysisKind = "refund";
    impactReason = "refund";
  } else if (/收入|收款/.test(flow)) analysisKind = "income";
  else if (/支出/.test(flow))
    analysisKind = isTransfer ? "transfer_out" : "expense";
  else if (isFamilyCardPurchase) analysisKind = "expense";
  else if (isTransfer && /收款/.test(`${input.rawType} ${status}`))
    analysisKind = "income";
  else if (/商户消费|消费|付款/.test(businessText)) analysisKind = "expense";
  else analysisKind = "neutral";

  if (!impactReason) {
    impactReason =
      analysisKind === "expense"
        ? "expense"
        : analysisKind === "transfer_out"
          ? "transfer_out"
          : analysisKind === "income"
            ? "income"
            : analysisKind === "refund"
              ? "refund"
              : "internal_transfer";
  }

  let category: FinanceCategory;
  if (analysisKind === "refund") category = "退款";
  else if (analysisKind === "income") category = "收入";
  else if (analysisKind === "neutral") category = "资金流转";
  else if (analysisKind === "transfer_out") category = "转账往来";
  else category = initialCategory(categoryText);

  return { analysisKind, category, isIncluded: true, impactReason };
}

export function financeImpactReasonLabel(reason: FinanceImpactReason): string {
  if (reason === "internal_transfer") return "内部转移";
  if (reason === "repayment") return "还款结算";
  if (reason === "failed_or_closed") return "交易失败/关闭";
  if (reason === "refund") return "退款到账";
  if (reason === "income") return "收入";
  if (reason === "transfer_out") return "转账支出";
  return "消费支出";
}

export function financePlatformLabel(platform: FinancePlatform): string {
  return platform === "alipay" ? "支付宝" : "微信";
}
