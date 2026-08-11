import type { DailyQuoteRecord } from "../../preload/api-types";
import {
  DAILY_QUOTE_AI_SHARE,
  DAILY_QUOTE_GENERATION_VERSION,
  normalizeQuoteText,
  selectCorpusQuote,
} from "../../shared/daily-quote-corpus";
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
    return this.generate(date);
  }

  async dislike(id: string): Promise<DailyQuoteRecord> {
    const quote = this.store.getDailyQuoteById(id);
    if (!quote) throw new Error("格言不存在");
    this.store.setDailyQuoteReaction(id, "disliked");
    return this.generate(quote.localDate);
  }

  setFavorite(id: string, favorite: boolean): void {
    this.store.setDailyQuoteReaction(id, favorite ? "favorite" : "none");
  }

  favorites(): DailyQuoteRecord[] {
    return this.store.listFavoriteQuotes();
  }

  retry(): Promise<DailyQuoteRecord> {
    const date = localDateKey(this.now());
    const existing = this.store.getDailyQuote(date);
    if (
      existing &&
      (existing.reaction === "favorite" ||
        existing.generationVersion >= DAILY_QUOTE_GENERATION_VERSION)
    )
      return Promise.resolve(existing);
    if (existing) this.store.setDailyQuoteReaction(existing.id, "disliked");
    return this.generate(date);
  }

  private generate(localDate: string): Promise<DailyQuoteRecord> {
    if (this.inFlight) {
      if (this.inFlight.localDate === localDate) return this.inFlight.promise;
      return this.inFlight.promise.then(() => this.generate(localDate));
    }
    const input: QuoteGenerationInput = {
      localDate,
      favorites: this.store.listFavoriteQuotes(8).map((quote) => quote.text),
      dislikes: this.store.listDislikedQuotes(12).map((quote) => quote.text),
      recent: this.store.listRecentQuotes(60).map((quote) => quote.text),
    };
    const promise = this.generateFromSources(localDate, input).finally(() => {
      this.inFlight = null;
    });
    this.inFlight = { localDate, promise };
    return promise;
  }

  private async generateFromSources(
    localDate: string,
    input: QuoteGenerationInput,
  ): Promise<DailyQuoteRecord> {
    if (this.random() >= DAILY_QUOTE_AI_SHARE) {
      const corpus = this.saveCorpusQuote(localDate, input);
      if (corpus) return corpus;
      return this.generateAiQuote(localDate, input);
    }

    try {
      return await this.generateAiQuote(localDate, input);
    } catch (error) {
      const corpus = this.saveCorpusQuote(localDate, input);
      if (corpus) return corpus;
      throw error;
    }
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

  private saveCorpusQuote(
    localDate: string,
    input: QuoteGenerationInput,
  ): DailyQuoteRecord | null {
    const quote = selectCorpusQuote({
      recent: input.recent,
      dislikes: input.dislikes,
      random: this.random,
    });
    if (!quote) return null;
    return this.store.saveGeneratedQuote(quote.text, localDate, {
      kind: "corpus",
      id: quote.id,
      generationVersion: DAILY_QUOTE_GENERATION_VERSION,
    });
  }
}
