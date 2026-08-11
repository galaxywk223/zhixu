import corpusData from "./daily-quote-corpus.json";

export const DAILY_QUOTE_GENERATION_VERSION = 2;
export const DAILY_QUOTE_AI_SHARE = 0.7;

export interface DailyQuoteCorpusEntry {
  id: string;
  text: string;
  attribution: string;
}

export const DAILY_QUOTE_CORPUS =
  corpusData.quotes as readonly DailyQuoteCorpusEntry[];

export function normalizeQuoteText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[，。！？；：、…—,.!?;:\s]/g, "")
    .toLocaleLowerCase("zh-CN");
}

function pick(
  entries: readonly DailyQuoteCorpusEntry[],
  random: () => number,
): DailyQuoteCorpusEntry | null {
  if (entries.length === 0) return null;
  const value = random();
  const ratio = Number.isFinite(value)
    ? Math.min(0.999_999, Math.max(0, value))
    : 0;
  return entries[Math.floor(ratio * entries.length)] ?? null;
}

export function selectCorpusQuote(input: {
  recent: readonly string[];
  dislikes: readonly string[];
  random?: () => number;
}): DailyQuoteCorpusEntry | null {
  const random = input.random ?? Math.random;
  const disliked = new Set(input.dislikes.map(normalizeQuoteText));
  const recent = new Set(input.recent.map(normalizeQuoteText));
  const eligible = DAILY_QUOTE_CORPUS.filter((quote) => {
    const normalized = normalizeQuoteText(quote.text);
    return !disliked.has(normalized) && !recent.has(normalized);
  });
  if (eligible.length > 0) return pick(eligible, random);
  return pick(
    DAILY_QUOTE_CORPUS.filter(
      (quote) => !disliked.has(normalizeQuoteText(quote.text)),
    ),
    random,
  );
}
