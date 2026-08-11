export interface DailyQuotePromptInput {
  localDate: string;
  favorites: string[];
  dislikes: string[];
  recent: string[];
}

export interface DailyQuoteMessage {
  role: "system" | "user";
  content: string;
}

function bounded(values: unknown, limit: number): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && Array.from(value).length <= 80)
    .slice(0, limit);
}

export function normalizePromptInput(value: unknown): DailyQuotePromptInput {
  const input = value && typeof value === "object" ? value : {};
  const record = input as Record<string, unknown>;
  const localDate =
    typeof record.localDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(record.localDate)
      ? record.localDate
      : "未知日期";
  return {
    localDate,
    favorites: bounded(record.favorites, 24),
    dislikes: bounded(record.dislikes, 40),
    recent: bounded(record.recent, 60),
  };
}

export function buildDailyQuoteMessages(
  input: DailyQuotePromptInput,
): DailyQuoteMessage[] {
  const preference = [
    `收藏示例：${JSON.stringify(input.favorites)}`,
    `不喜欢示例：${JSON.stringify(input.dislikes)}`,
    `近期已生成：${JSON.stringify(input.recent)}`,
  ].join("\n");
  return [
    {
      role: "system",
      content:
        '生成一条克制、具体、有余味的中文每日格言。根据收藏示例学习用户偏好的主题、节奏和表达，根据不喜欢示例主动回避对应模式。没有反馈时均衡考虑哲思、行动、生活与学习，避免鸡汤、命令式说教、陈词滥调和空泛口号。不得复述近期已生成内容。只返回 JSON 对象，格式为 {"text":"格言"}。格言必须单行、6至48个字符，只能包含汉字和常用中文标点，不含作者、出处、标题、引号、Markdown、Emoji、数字或解释。',
    },
    {
      role: "user",
      content: `日期：${input.localDate}\n${preference}\n生成一条新的格言。`,
    },
  ];
}

export function validateDailyQuoteText(value: unknown): string {
  if (typeof value !== "string") throw new Error("格言正文缺失");
  const text = value.trim();
  const length = Array.from(text).length;
  if (length < 6 || length > 48) throw new Error("格言长度不符合要求");
  if (/\r|\n/.test(text)) throw new Error("格言不能换行");
  if (/^[\p{Script=Han}]{1,8}[：:]/u.test(text) || /[“”‘’「」『』]/u.test(text))
    throw new Error("格言包含作者、标题或引号");
  if (!/^[\p{Script=Han}，。！？；：、…—]+$/u.test(text))
    throw new Error("格言包含不允许的字符");
  return text;
}

export function parseDailyQuoteResponse(value: unknown): string {
  if (typeof value !== "string") throw new Error("模型响应为空");
  const parsed = JSON.parse(value) as { text?: unknown };
  return validateDailyQuoteText(parsed.text);
}
