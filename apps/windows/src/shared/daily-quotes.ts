export const DAILY_QUOTE_GENERATION_VERSION = 4;
export const DAILY_QUOTE_FAVORITE_SHARE = 0.2;

export function normalizeQuoteText(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/[，。！？；：、…—,.!?;:\s]/g, "")
    .toLocaleLowerCase("zh-CN");
}
