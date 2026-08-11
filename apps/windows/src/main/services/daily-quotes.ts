import type { DailyQuoteRecord } from "../../preload/api-types";
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
  ) {}

  async today(): Promise<DailyQuoteRecord | null> {
    const date = localDateKey(this.now());
    return this.store.getDailyQuote(date) ?? this.generate(date);
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
    return existing ? Promise.resolve(existing) : this.generate(date);
  }

  private generate(localDate: string): Promise<DailyQuoteRecord> {
    if (this.inFlight) {
      if (this.inFlight.localDate === localDate) return this.inFlight.promise;
      return this.inFlight.promise.then(() => this.generate(localDate));
    }
    const input: QuoteGenerationInput = {
      localDate,
      favorites: this.store.listFavoriteQuotes(24).map((quote) => quote.text),
      dislikes: this.store.listDislikedQuotes(40).map((quote) => quote.text),
      recent: this.store.listRecentQuotes(60).map((quote) => quote.text),
    };
    const promise = this.sync
      .generateDailyQuote(input)
      .then((text) =>
        this.store.saveGeneratedQuote(validateDailyQuoteText(text), localDate),
      )
      .finally(() => {
        this.inFlight = null;
      });
    this.inFlight = { localDate, promise };
    return promise;
  }
}
