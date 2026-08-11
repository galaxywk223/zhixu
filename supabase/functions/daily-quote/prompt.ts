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
    favorites: bounded(record.favorites, 8),
    dislikes: bounded(record.dislikes, 12),
    recent: bounded(record.recent, 60),
  };
}

export function buildDailyQuoteMessages(
  input: DailyQuotePromptInput,
): DailyQuoteMessage[] {
  const preference = [
    `收藏：${JSON.stringify(input.favorites)}`,
    `不喜欢：${JSON.stringify(input.dislikes)}`,
  ].join("\n");
  return [
    {
      role: "system",
      content:
        '根据反馈生成一句自然、独立的中文格言。借鉴收藏，避开不喜欢内容，不要照抄；表达可以变化，但不要写成诗歌、古风或刻意对仗。只返回 {"text":"格言"}，正文单行、8至42个字符，不含作者、出处或解释。',
    },
    {
      role: "user",
      content: `日期：${input.localDate}\n${preference}`,
    },
  ];
}

export function validateDailyQuoteText(value: unknown): string {
  if (typeof value !== "string") throw new Error("格言正文缺失");
  const text = value.trim();
  if (/\r|\n/.test(text)) throw new Error("格言不能换行");
  const length = Array.from(text).length;
  if (length < 8 || length > 42) throw new Error("格言长度不符合要求");
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

function normalizedQuote(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[，。！？；：、…—,.!?;:\s]/g, "")
    .toLocaleLowerCase("zh-CN");
}

export function isDailyQuoteDuplicate(
  text: string,
  recent: readonly string[],
): boolean {
  const normalized = normalizedQuote(text);
  return recent.some((value) => normalizedQuote(value) === normalized);
}
