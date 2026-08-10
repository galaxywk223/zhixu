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
}

const successfulStatus =
  /成功|已完成|支付成功|已收钱|已转账|对方已收钱|已存入零钱通/;
const unavailableStatus = /失败|关闭|未支付|待支付|处理中|已撤销|已退回/;
const refundText = /退款|退回|退款成功|已全额退款|已退款/;
const neutralText =
  /充值|提现|还款|理财|基金|余额宝|零钱通|信用卡|银行卡转入|银行卡转出|账户互转/;
const transferText = /转账|红包|收款|二维码收付款|群收款|AA收款/;

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
  const text = [
    input.rawType,
    input.counterparty,
    input.description,
    input.paymentMethod,
  ].join(" ");
  const flow = input.rawFlow.trim();
  const status = input.rawStatus.trim();
  const isRefund = refundText.test(`${status} ${text}`);
  const isNeutral = neutralText.test(text) && !isRefund;
  const isTransfer = transferText.test(`${input.rawType} ${input.description}`);

  let analysisKind: FinanceAnalysisKind;
  if (isRefund) analysisKind = "refund";
  else if (isNeutral) analysisKind = "neutral";
  else if (/收入|收款/.test(flow)) analysisKind = "income";
  else if (/支出/.test(flow))
    analysisKind = isTransfer ? "transfer_out" : "expense";
  else if (/亲属卡/.test(input.paymentMethod) && successfulStatus.test(status))
    analysisKind = "expense";
  else if (isTransfer && /收款/.test(`${input.rawType} ${status}`))
    analysisKind = "income";
  else analysisKind = "neutral";

  let category: FinanceCategory;
  if (analysisKind === "refund") category = "退款";
  else if (analysisKind === "income") category = "收入";
  else if (analysisKind === "neutral") category = "资金流转";
  else if (analysisKind === "transfer_out") category = "转账往来";
  else category = initialCategory(text);

  const isUnavailable = unavailableStatus.test(status);
  const isIncluded = input.isRefundedOriginal
    ? true
    : !isUnavailable &&
      (successfulStatus.test(status) || status === "" || status === "/");

  return { analysisKind, category, isIncluded };
}

export function financePlatformLabel(platform: FinancePlatform): string {
  return platform === "alipay" ? "支付宝" : "微信";
}
