import type { DailyQuoteRecord } from "../../preload/api-types";
import {
  DAILY_QUOTE_FAVORITE_SHARE,
  DAILY_QUOTE_GENERATION_VERSION,
  normalizeQuoteText,
} from "../../shared/daily-quotes";
import { localDateKey } from "../../shared/local-date";
import { validateDailyQuoteText } from "../../../../../supabase/functions/daily-quote/prompt";
import type { SyncService } from "./sync";
import type { ZhixuStore } from "../store";

export interface QuoteGenerationInput {
  localDate: string;
  favorites: string[];
  dislikes: string[];
  recent: string[];
}

function uniqueTexts(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = normalizeQuoteText(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export class DailyQuoteService {
  private inFlight: {
    localDate: string;
    promise: Promise<DailyQuoteRecord>;
  } | null = null;

  constructor(
    private readonly store: ZhixuStore,
    private readonly sync: SyncService,
    private readonly now: () => Date = () => new Date(),
    private readonly random: () => number = Math.random,
  ) {}

  async today(): Promise<DailyQuoteRecord | null> {
    const date = localDateKey(this.now());
    const existing = this.store.getDailyQuote(date);
    if (
      existing &&
      (existing.reaction === "favorite" ||
        existing.generationVersion >= DAILY_QUOTE_GENERATION_VERSION)
    )
      return existing;
    if (existing) this.store.setDailyQuoteReaction(existing.id, "disliked");
    return this.generate(date, existing ? [existing.text] : []);
  }

  async dislike(id: string): Promise<DailyQuoteRecord> {
    const quote = this.store.getDailyQuoteById(id);
    if (!quote) throw new Error("格言不存在");
    if (quote.sourceKind === "favorite" && quote.sourceId) {
      const source = this.store.getDailyQuoteById(quote.sourceId);
      if (source) this.store.setDailyQuoteReaction(source.id, "disliked");
    }
    this.store.setDailyQuoteReaction(id, "disliked");
    return this.generate(quote.localDate, [quote.text]);
  }

  setFavorite(id: string, favorite: boolean): DailyQuoteRecord {
    const quote = this.store.getDailyQuoteById(id);
    if (!quote) throw new Error("格言不存在");
    if (quote.sourceKind !== "favorite" || !quote.sourceId)
      return this.store.setDailyQuoteReaction(
        quote.id,
        favorite ? "favorite" : "none",
      );

    const source = this.store.getDailyQuoteById(quote.sourceId);
    if (!source) throw new Error("原收藏格言不存在");
    this.store.setDailyQuoteReaction(source.id, favorite ? "favorite" : "none");
    return this.store.setDailyQuoteReaction(
      quote.id,
      favorite ? "favorite" : "none",
    );
  }

  favorites(): DailyQuoteRecord[] {
    return this.store.listFavoriteQuotes();
  }

  addFavorite(text: string): DailyQuoteRecord {
    return this.store.addManualFavorite(text, localDateKey(this.now()));
  }

  removeFavorite(id: string): void {
    const quote = this.store.getDailyQuoteById(id);
    if (!quote || quote.sourceKind !== "manual")
      throw new Error("只能删除手动添加的格言");
    for (const display of this.store.listFavoriteDisplays(quote.id))
      this.store.setDailyQuoteReaction(display.id, "none");
    this.store.removeDailyQuote(quote.id);
  }

  useFavoriteToday(id: string): DailyQuoteRecord {
    return this.store.saveFavoriteForDate(id, localDateKey(this.now()));
  }

  refresh(): Promise<DailyQuoteRecord> {
    const localDate = localDateKey(this.now());
    const current = this.store.getDailyQuote(localDate);
    return this.generate(localDate, current ? [current.text] : []);
  }

  retry(): Promise<DailyQuoteRecord> {
    return this.generate(localDateKey(this.now()));
  }

  private generate(
    localDate: string,
    excludedTexts: readonly string[] = [],
  ): Promise<DailyQuoteRecord> {
    if (this.inFlight) {
      if (this.inFlight.localDate === localDate) return this.inFlight.promise;
      return this.inFlight.promise.then(() =>
        this.generate(localDate, excludedTexts),
      );
    }
    const promise = this.generateFromSources(localDate, excludedTexts).finally(
      () => {
        this.inFlight = null;
      },
    );
    this.inFlight = { localDate, promise };
    return promise;
  }

  private generationInput(localDate: string): QuoteGenerationInput {
    const favorites = uniqueTexts(
      this.store.listFavoriteQuotes().map((quote) => quote.text),
    );
    const positive = new Set(favorites.map(normalizeQuoteText));
    const dislikes = uniqueTexts(
      this.store
        .listDislikedQuotes(200)
        .map((quote) => quote.text)
        .filter((text) => !positive.has(normalizeQuoteText(text))),
    ).slice(0, 12);
    return {
      localDate,
      favorites,
      dislikes,
      recent: uniqueTexts(
        this.store.listRecentQuotes(60).map((quote) => quote.text),
      ),
    };
  }

  private async generateFromSources(
    localDate: string,
    excludedTexts: readonly string[],
  ): Promise<DailyQuoteRecord> {
    const favorites = this.favoriteCandidates(
      this.store.listFavoriteQuotes(),
      excludedTexts,
    );
    if (favorites.length && this.random() < DAILY_QUOTE_FAVORITE_SHARE)
      return this.saveRandomFavorite(localDate, favorites);

    const input = this.generationInput(localDate);
    try {
      return await this.generateAiQuote(localDate, input);
    } catch (error) {
      if (favorites.length)
        return this.saveRandomFavorite(localDate, favorites);
      throw error;
    }
  }

  private saveRandomFavorite(
    localDate: string,
    favorites: readonly DailyQuoteRecord[],
  ): DailyQuoteRecord {
    const index = Math.min(
      favorites.length - 1,
      Math.floor(this.random() * favorites.length),
    );
    return this.store.saveFavoriteForDate(favorites[index]!.id, localDate);
  }

  private favoriteCandidates(
    favorites: readonly DailyQuoteRecord[],
    excludedTexts: readonly string[],
  ): DailyQuoteRecord[] {
    const excluded = new Set(excludedTexts.map(normalizeQuoteText));
    const candidates = favorites.filter(
      (quote) => !excluded.has(normalizeQuoteText(quote.text)),
    );
    const recent = new Set(
      this.store
        .listRecentQuotes(5)
        .map((quote) => normalizeQuoteText(quote.text)),
    );
    const eligible = candidates.filter(
      (quote) => !recent.has(normalizeQuoteText(quote.text)),
    );
    return eligible.length ? eligible : candidates;
  }

  private async generateAiQuote(
    localDate: string,
    input: QuoteGenerationInput,
  ): Promise<DailyQuoteRecord> {
    const text = validateDailyQuoteText(
      await this.sync.generateDailyQuote(input),
    );
    const normalized = normalizeQuoteText(text);
    if (input.recent.some((value) => normalizeQuoteText(value) === normalized))
      throw new Error("格言与近期内容重复");
    return this.store.saveGeneratedQuote(text, localDate, {
      kind: "ai",
      generationVersion: DAILY_QUOTE_GENERATION_VERSION,
    });
  }
}
