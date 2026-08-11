// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initializeDatabase } from "../src/main/database";
import { DailyQuoteService } from "../src/main/services/daily-quotes";
import type { SyncService } from "../src/main/services/sync";
import { ZhixuStore } from "../src/main/store";
import {
  DAILY_QUOTE_AI_SHARE,
  DAILY_QUOTE_CORPUS,
  DAILY_QUOTE_GENERATION_VERSION,
  normalizeQuoteText,
  selectCorpusQuote,
} from "../src/shared/daily-quote-corpus";
import {
  buildDailyQuoteMessages,
  isDailyQuoteDuplicate,
  normalizePromptInput,
  parseDailyQuoteResponse,
  validateDailyQuoteText,
} from "../../../supabase/functions/daily-quote/prompt";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function setup(generateDailyQuote = vi.fn()) {
  const root = mkdtempSync(join(tmpdir(), "zhixu-quotes-test-"));
  directories.push(root);
  const context = initializeDatabase({
    source: join(root, "legacy.sqlite"),
    target: join(root, "data", "zhixu.sqlite"),
    backups: join(root, "backups"),
  });
  const store = new ZhixuStore(context.db, "quote-device");
  const sync = { generateDailyQuote } as unknown as SyncService;
  return { store, sync, db: context.db, generateDailyQuote };
}

describe("daily quote service", () => {
  it("reuses one local quote per day and coalesces concurrent generation", async () => {
    let resolve!: (value: string) => void;
    const pending = new Promise<string>((done) => {
      resolve = done;
    });
    const generate = vi.fn().mockReturnValue(pending);
    const { store, sync, db } = setup(generate);
    const now = new Date(2026, 7, 11, 8, 30);
    const service = new DailyQuoteService(
      store,
      sync,
      () => now,
      () => 0,
    );

    const first = service.today();
    const second = service.today();
    expect(generate).toHaveBeenCalledTimes(1);
    resolve("把今天走稳，远方自然会近。");
    await expect(first).resolves.toMatchObject({
      localDate: "2026-08-11",
      sourceKind: "ai",
      generationVersion: DAILY_QUOTE_GENERATION_VERSION,
    });
    await expect(second).resolves.toMatchObject({ sourceKind: "ai" });
    await service.today();
    expect(generate).toHaveBeenCalledTimes(1);
    db.close();
  });

  it("keeps dislike feedback and falls back to the corpus when AI fails", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("offline"));
    const { store, sync, db } = setup(generate);
    const original = store.saveGeneratedQuote(
      "把今天走稳，远方自然会近。",
      "2026-08-11",
    );
    const service = new DailyQuoteService(
      store,
      sync,
      () => new Date(2026, 7, 11, 10),
      () => 0,
    );

    await expect(service.dislike(original.id)).resolves.toMatchObject({
      sourceKind: "corpus",
      generationVersion: DAILY_QUOTE_GENERATION_VERSION,
    });
    expect(store.listDislikedQuotes()[0]?.id).toBe(original.id);
    expect(generate.mock.calls[0]?.[0]).toMatchObject({
      dislikes: ["把今天走稳，远方自然会近。"],
    });
    db.close();
  });

  it("uses the corpus directly for the thirty percent branch", async () => {
    const generate = vi.fn();
    const { store, sync, db } = setup(generate);
    const values = [DAILY_QUOTE_AI_SHARE, 0];
    const service = new DailyQuoteService(
      store,
      sync,
      () => new Date(2026, 7, 11, 10),
      () => values.shift() ?? 0,
    );

    await expect(service.today()).resolves.toMatchObject({
      text: DAILY_QUOTE_CORPUS[0]?.text,
      sourceKind: "corpus",
      sourceId: DAILY_QUOTE_CORPUS[0]?.id,
    });
    expect(generate).not.toHaveBeenCalled();
    db.close();
  });

  it("replaces an unreacted first-generation quote but preserves a favorite", async () => {
    const first = setup(vi.fn());
    const legacy = first.store.saveGeneratedQuote(
      "溪水不争自东流，青松无求向天立。",
      "2026-08-11",
    );
    const values = [DAILY_QUOTE_AI_SHARE, 0];
    const service = new DailyQuoteService(
      first.store,
      first.sync,
      () => new Date(2026, 7, 11, 10),
      () => values.shift() ?? 0,
    );
    await expect(service.today()).resolves.toMatchObject({
      sourceKind: "corpus",
      generationVersion: DAILY_QUOTE_GENERATION_VERSION,
    });
    expect(first.store.getDailyQuoteById(legacy.id)?.reaction).toBe("disliked");
    first.db.close();

    const second = setup(vi.fn());
    const favorite = second.store.saveGeneratedQuote(
      "清醒地选择，比匆忙地抵达更重要。",
      "2026-08-11",
    );
    second.store.setDailyQuoteReaction(favorite.id, "favorite");
    const favoriteService = new DailyQuoteService(
      second.store,
      second.sync,
      () => new Date(2026, 7, 11, 10),
      () => 0,
    );
    await expect(favoriteService.today()).resolves.toMatchObject({
      id: favorite.id,
      reaction: "favorite",
      generationVersion: 1,
    });
    expect(second.generateDailyQuote).not.toHaveBeenCalled();
    second.db.close();
  });

  it("feeds reactions from both sources into a bounded AI request", async () => {
    const generate = vi
      .fn()
      .mockResolvedValue("把注意力放回能够改变的事情上。 ");
    const { store, sync, db } = setup(generate);
    const favorite = store.saveGeneratedQuote(
      DAILY_QUOTE_CORPUS[0]!.text,
      "2026-08-09",
      {
        kind: "corpus",
        id: DAILY_QUOTE_CORPUS[0]!.id,
        generationVersion: DAILY_QUOTE_GENERATION_VERSION,
      },
    );
    store.setDailyQuoteReaction(favorite.id, "favorite");
    const disliked = store.saveGeneratedQuote(
      "心若浮云聚散，意如磐石自安。",
      "2026-08-10",
      { kind: "ai", generationVersion: DAILY_QUOTE_GENERATION_VERSION },
    );
    store.setDailyQuoteReaction(disliked.id, "disliked");
    const service = new DailyQuoteService(
      store,
      sync,
      () => new Date(2026, 7, 11, 10),
      () => 0,
    );

    await service.today();
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        favorites: [DAILY_QUOTE_CORPUS[0]!.text],
        dislikes: ["心若浮云聚散，意如磐石自安。"],
      }),
    );
    db.close();
  });

  it("stores only favorites in the visible collection", () => {
    const { store, db } = setup();
    const favorite = store.saveGeneratedQuote(
      "清醒地选择，比匆忙地抵达更重要。",
      "2026-08-10",
    );
    const disliked = store.saveGeneratedQuote(
      "慢一点，才能听见真正重要的声音。",
      "2026-08-11",
    );
    store.setDailyQuoteReaction(favorite.id, "favorite");
    store.setDailyQuoteReaction(disliked.id, "disliked");
    expect(store.listFavoriteQuotes().map((item) => item.id)).toEqual([
      favorite.id,
    ]);
    expect(store.listDislikedQuotes().map((item) => item.id)).toEqual([
      disliked.id,
    ]);
    db.close();
  });

  it("keeps generation and feedback timestamps monotonic during rapid actions", () => {
    const { store, db } = setup();
    const first = store.saveGeneratedQuote(
      "把今天走稳，远方自然会近。",
      "2026-08-11",
    );
    const second = store.saveGeneratedQuote(
      "耐心不是停留，而是清醒地前行。",
      "2026-08-11",
    );
    expect(Date.parse(second.generatedAt)).toBeGreaterThan(
      Date.parse(first.generatedAt),
    );
    store.setDailyQuoteReaction(second.id, "favorite");
    expect(
      Date.parse(store.getDailyQuoteById(second.id)!.updatedAt),
    ).toBeGreaterThan(Date.parse(second.updatedAt));
    db.close();
  });
});

describe("daily quote prompt", () => {
  it("bounds feedback examples and keeps positive and negative guidance", () => {
    const input = normalizePromptInput({
      localDate: "2026-08-11",
      favorites: Array.from({ length: 30 }, (_, index) => `收藏内容${index}`),
      dislikes: Array.from({ length: 50 }, (_, index) => `负面内容${index}`),
      recent: Array.from({ length: 70 }, (_, index) => `近期内容${index}`),
    });
    expect(input.favorites).toHaveLength(8);
    expect(input.dislikes).toHaveLength(12);
    expect(input.recent).toHaveLength(60);
    const prompt = buildDailyQuoteMessages(input)
      .map((item) => item.content)
      .join("\n");
    expect(prompt).toContain("收藏：");
    expect(prompt).toContain("不喜欢：");
    expect(prompt).toContain("不要写成诗歌、古风或刻意对仗");
    expect(prompt).not.toContain("近期内容0");
    expect(buildDailyQuoteMessages(input)[0]!.content.length).toBeLessThan(180);
  });

  it("accepts strict JSON Chinese text and rejects decorated output", () => {
    expect(
      parseDailyQuoteResponse('{"text":"把今天走稳，远方自然会近。"}'),
    ).toBe("把今天走稳，远方自然会近。");
    expect(() => validateDailyQuoteText("鲁迅：时间就像海绵里的水。")).toThrow(
      "作者",
    );
    expect(() => validateDailyQuoteText("第一行\n第二行")).toThrow("换行");
    expect(() => parseDailyQuoteResponse("```json\n{}\n```")).toThrow();
    expect(
      isDailyQuoteDuplicate("把今天走稳，远方自然会近！", [
        "把今天走稳，远方自然会近。",
      ]),
    ).toBe(true);
  });
});

describe("daily quote corpus", () => {
  it("contains reviewed unique entries with valid display text", () => {
    expect(DAILY_QUOTE_CORPUS).toHaveLength(153);
    expect(new Set(DAILY_QUOTE_CORPUS.map((quote) => quote.id)).size).toBe(153);
    expect(
      new Set(DAILY_QUOTE_CORPUS.map((quote) => normalizeQuoteText(quote.text)))
        .size,
    ).toBe(153);
    for (const quote of DAILY_QUOTE_CORPUS) {
      expect(validateDailyQuoteText(quote.text)).toBe(quote.text);
      expect(quote.attribution.length).toBeGreaterThan(0);
    }
  });

  it("excludes recent and disliked entries and relaxes only recent history", () => {
    const first = DAILY_QUOTE_CORPUS[0]!;
    const second = DAILY_QUOTE_CORPUS[1]!;
    const selected = selectCorpusQuote({
      recent: [first.text],
      dislikes: [second.text],
      random: () => 0,
    });
    expect(selected?.id).not.toBe(first.id);
    expect(selected?.id).not.toBe(second.id);
    expect(
      selectCorpusQuote({
        recent: DAILY_QUOTE_CORPUS.map((quote) => quote.text),
        dislikes: [],
        random: () => 0,
      }),
    ).toMatchObject({ id: first.id });
    expect(
      selectCorpusQuote({
        recent: [],
        dislikes: DAILY_QUOTE_CORPUS.map((quote) => quote.text),
      }),
    ).toBeNull();
  });
});
