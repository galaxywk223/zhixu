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
  buildDailyQuoteMessages,
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
    const service = new DailyQuoteService(store, sync, () => now);

    const first = service.today();
    const second = service.today();
    expect(generate).toHaveBeenCalledTimes(1);
    resolve("把今天走稳，远方自然会近。");
    await expect(first).resolves.toMatchObject({ localDate: "2026-08-11" });
    await expect(second).resolves.toMatchObject({ localDate: "2026-08-11" });
    await service.today();
    expect(generate).toHaveBeenCalledTimes(1);
    db.close();
  });

  it("keeps dislike feedback when replacement fails and uses it on retry", async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce("耐心不是停留，而是清醒地前行。");
    const { store, sync, db } = setup(generate);
    const original = store.saveGeneratedQuote(
      "把今天走稳，远方自然会近。",
      "2026-08-11",
    );
    const service = new DailyQuoteService(
      store,
      sync,
      () => new Date(2026, 7, 11, 10),
    );

    await expect(service.dislike(original.id)).rejects.toThrow("offline");
    expect(store.getDailyQuote("2026-08-11")).toBeNull();
    expect(store.listDislikedQuotes()[0]?.id).toBe(original.id);
    await expect(service.retry()).resolves.toMatchObject({
      text: "耐心不是停留，而是清醒地前行。",
    });
    expect(generate.mock.calls[1]?.[0]).toMatchObject({
      dislikes: ["把今天走稳，远方自然会近。"],
    });
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
    expect(input.favorites).toHaveLength(24);
    expect(input.dislikes).toHaveLength(40);
    expect(input.recent).toHaveLength(60);
    const prompt = buildDailyQuoteMessages(input)
      .map((item) => item.content)
      .join("\n");
    expect(prompt).toContain("收藏示例");
    expect(prompt).toContain("不喜欢示例");
    expect(prompt).toContain("不得复述近期已生成内容");
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
  });
});
