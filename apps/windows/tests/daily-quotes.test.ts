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
  DAILY_QUOTE_FAVORITE_SHARE,
  DAILY_QUOTE_GENERATION_VERSION,
  normalizeQuoteText,
} from "../src/shared/daily-quotes";
import {
  DEFAULT_DAILY_QUOTE_STYLE,
  buildQuoteGenerationMessages,
  buildSemanticReviewMessages,
  buildStyleProfileMessages,
  isDailyQuoteDuplicate,
  normalizePromptInput,
  parseDailyQuoteSemanticReview,
  parseDailyQuoteStyleProfile,
  parseDailyQuoteResponse,
  styleProfileContainsSourceText,
  validateDailyQuoteText,
} from "../../../supabase/functions/daily-quote/prompt";
import { generateDailyQuote } from "../../../supabase/functions/daily-quote/pipeline";
import {
  DailyQuoteGenerationFailure,
  classifyUpstreamStatus,
  failureBody,
  isRetryableFailureReason,
  safeUpstreamCode,
} from "../../../supabase/functions/daily-quote/errors";

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

  it("selects a favorite for the twenty percent branch and keeps its heart", async () => {
    const generate = vi.fn();
    const { store, sync, db } = setup(generate);
    const favorite = store.addManualFavorite(
      "清醒地选择，比匆忙地抵达更重要。",
      "2026-08-10",
    );
    const values = [DAILY_QUOTE_FAVORITE_SHARE - 0.01, 0];
    const service = new DailyQuoteService(
      store,
      sync,
      () => new Date(2026, 7, 11, 10),
      () => values.shift() ?? 0,
    );

    await expect(service.today()).resolves.toMatchObject({
      text: favorite.text,
      sourceKind: "favorite",
      sourceId: favorite.id,
      reaction: "favorite",
    });
    expect(store.listFavoriteQuotes()).toHaveLength(1);
    expect(generate).not.toHaveBeenCalled();
    db.close();
  });

  it("falls back to a favorite when AI generation fails", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("offline"));
    const { store, sync, db } = setup(generate);
    const favorite = store.addManualFavorite(
      "先完成重要的事，再处理其余声音。",
      "2026-08-10",
    );
    const service = new DailyQuoteService(
      store,
      sync,
      () => new Date(2026, 7, 11, 10),
      () => 0.9,
    );

    await expect(service.today()).resolves.toMatchObject({
      sourceKind: "favorite",
      sourceId: favorite.id,
    });
    expect(generate).toHaveBeenCalledTimes(1);
    db.close();
  });

  it("keeps the current quote and writes nothing when no different fallback exists", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("upstream failed"));
    const { store, sync, db } = setup(generate);
    const favorite = store.addManualFavorite(
      "燕雀安知鸿鹄之志。",
      "2026-08-10",
    );
    const display = store.saveFavoriteForDate(favorite.id, "2026-08-11");
    const before = db
      .prepare("SELECT COUNT(*) AS count FROM daily_quotes")
      .get() as { count: number };
    const service = new DailyQuoteService(
      store,
      sync,
      () => new Date(2026, 7, 11, 10),
      () => 0,
    );

    await expect(service.refresh()).rejects.toThrow("upstream failed");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(store.getDailyQuote("2026-08-11")?.id).toBe(display.id);
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM daily_quotes").get(),
    ).toEqual(before);
    db.close();
  });

  it("selects only a different favorite during neutral refresh", async () => {
    const generate = vi.fn();
    const { store, sync, db } = setup(generate);
    const current = store.addManualFavorite("燕雀安知鸿鹄之志。", "2026-08-10");
    const alternative = store.addManualFavorite(
      "把复杂的事情做简单。",
      "2026-08-10",
    );
    store.saveFavoriteForDate(current.id, "2026-08-11");
    const values = [DAILY_QUOTE_FAVORITE_SHARE - 0.01, 0];
    const service = new DailyQuoteService(
      store,
      sync,
      () => new Date(2026, 7, 11, 10),
      () => values.shift() ?? 0,
    );

    await expect(service.refresh()).resolves.toMatchObject({
      text: alternative.text,
      sourceKind: "favorite",
      sourceId: alternative.id,
    });
    expect(generate).not.toHaveBeenCalled();
    db.close();
  });

  it("keeps a disliked quote rejected when replacement generation fails", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("upstream failed"));
    const { store, sync, db } = setup(generate);
    const favorite = store.addManualFavorite(
      "燕雀安知鸿鹄之志。",
      "2026-08-10",
    );
    const display = store.saveFavoriteForDate(favorite.id, "2026-08-11");
    const service = new DailyQuoteService(
      store,
      sync,
      () => new Date(2026, 7, 11, 10),
      () => 0,
    );

    await expect(service.dislike(display.id)).rejects.toThrow(
      "upstream failed",
    );
    expect(store.getDailyQuoteById(display.id)?.reaction).toBe("disliked");
    expect(store.getDailyQuoteById(favorite.id)?.reaction).toBe("disliked");
    db.close();
  });

  it("uses dislike as negative feedback but keeps neutral refresh neutral", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce("把注意力放回能够改变的事情上。")
      .mockResolvedValueOnce("行动会把模糊的方向变得清楚。");
    const { store, sync, db } = setup(generate);
    const source = store.addManualFavorite(
      "耐心不是停留，而是清醒地前行。",
      "2026-08-10",
    );
    const display = store.saveFavoriteForDate(source.id, "2026-08-11");
    const service = new DailyQuoteService(
      store,
      sync,
      () => new Date(2026, 7, 11, 10),
      () => 0.9,
    );

    await service.refresh();
    expect(store.getDailyQuoteById(source.id)?.reaction).toBe("favorite");
    await service.dislike(display.id);
    expect(store.getDailyQuoteById(source.id)?.reaction).toBe("disliked");
    expect(store.getDailyQuoteById(display.id)?.reaction).toBe("disliked");
    db.close();
  });

  it("sends every unique favorite and removes positive-negative conflicts", async () => {
    const generate = vi
      .fn()
      .mockResolvedValue("把注意力放回能够改变的事情上。");
    const { store, sync, db } = setup(generate);
    for (let index = 0; index < 30; index += 1)
      store.addManualFavorite(
        `收藏内容第${index}条保持清醒行动。`,
        "2026-08-10",
      );
    const conflict = store.saveGeneratedQuote(
      "收藏内容第0条保持清醒行动！",
      "2026-08-09",
    );
    store.setDailyQuoteReaction(conflict.id, "disliked");
    const service = new DailyQuoteService(
      store,
      sync,
      () => new Date(2026, 7, 11, 10),
      () => 0.9,
    );

    await service.today();
    const input = generate.mock.calls[0]?.[0];
    expect(input.favorites).toHaveLength(30);
    expect(input.dislikes).not.toContain("收藏内容第0条保持清醒行动！");
    db.close();
  });

  it("adds unique manual favorites and deletes them with linked displays", () => {
    const { store, sync, db } = setup();
    const service = new DailyQuoteService(
      store,
      sync,
      () => new Date(2026, 7, 11, 10),
    );
    const favorite = service.addFavorite("把今天走稳，远方自然会近。");
    expect(favorite).toMatchObject({
      reaction: "favorite",
      sourceKind: "manual",
    });
    expect(() => service.addFavorite("把今天走稳，远方自然会近！")).toThrow(
      "已在收藏中",
    );
    const display = service.useFavoriteToday(favorite.id);
    service.removeFavorite(favorite.id);
    expect(store.getDailyQuoteById(favorite.id)).toBeNull();
    expect(store.getDailyQuoteById(display.id)?.reaction).toBe("none");
    db.close();
  });

  it("replaces an unreacted legacy generation but preserves a favorite", async () => {
    const first = setup(
      vi.fn().mockResolvedValue("把今天走稳，远方自然会近。"),
    );
    const legacy = first.store.saveGeneratedQuote(
      "旧版本留下的今日格言仍需重新生成。",
      "2026-08-11",
    );
    const service = new DailyQuoteService(
      first.store,
      first.sync,
      () => new Date(2026, 7, 11, 10),
    );
    await service.today();
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
    );
    await expect(favoriteService.today()).resolves.toMatchObject({
      id: favorite.id,
      reaction: "favorite",
    });
    expect(second.generateDailyQuote).not.toHaveBeenCalled();
    second.db.close();
  });
});

describe("daily quote prompt", () => {
  it("isolates style learning and retries a semantically overlapping candidate", async () => {
    const responses = [
      JSON.stringify(DEFAULT_DAILY_QUOTE_STYLE),
      '{"text":"每一步都在靠近想要的答案。"}',
      '{"sameMeaning":true,"reason":"核心都是坚持行动才能抵达目标"}',
      '{"text":"安静下来，才能听见细节里的变化。"}',
      '{"sameMeaning":false,"reason":"只共享克制语气，核心命题不同"}',
    ];
    const requests: Array<{
      stage: string;
      messages: Array<{ content: string }>;
    }> = [];
    const failures: string[] = [];
    const result = await generateDailyQuote(
      {
        localDate: "2026-08-16",
        favorites: ["耐心不是停留，而是清醒地前行。"],
        dislikes: ["只要努力就一定成功。"],
        recent: ["昨天的格言已经完成。"],
      },
      async (request) => {
        requests.push(request);
        return responses.shift()!;
      },
      (stage, _attempt, failure) => failures.push(`${stage}:${failure.reason}`),
    );

    expect(result).toBe("安静下来，才能听见细节里的变化。");
    expect(requests.map((request) => request.stage)).toEqual([
      "style",
      "generation",
      "semantic_review",
      "generation",
      "semantic_review",
    ]);
    expect(
      requests[1]!.messages.map((message) => message.content).join("\n"),
    ).not.toContain("耐心不是停留");
    expect(
      requests[3]!.messages.map((message) => message.content).join("\n"),
    ).toContain("核心意思相近");
    expect(failures).toContain("generation:semantic_overlap");
  });

  it("keeps all positive examples and bounds negative and recent guidance", () => {
    const input = normalizePromptInput({
      localDate: "2026-08-11",
      favorites: Array.from({ length: 30 }, (_, index) => `收藏内容${index}`),
      dislikes: [
        "收藏内容0",
        ...Array.from({ length: 50 }, (_, index) => `负面内容${index}`),
      ],
      recent: Array.from({ length: 70 }, (_, index) => `近期内容${index}`),
    });
    expect(input.favorites).toHaveLength(30);
    expect(input.dislikes).toHaveLength(11);
    expect(input.dislikes).not.toContain("收藏内容0");
    expect(input.recent).toHaveLength(60);
    const stylePrompt = buildStyleProfileMessages(input)
      .map((item) => item.content)
      .join("\n");
    expect(stylePrompt).toContain("收藏内容29");
    expect(stylePrompt).toContain("严禁总结样本的主题");
    const generationPrompt = buildQuoteGenerationMessages(
      DEFAULT_DAILY_QUOTE_STYLE,
    )
      .map((item) => item.content)
      .join("\n");
    expect(generationPrompt).not.toContain("收藏内容29");
    expect(generationPrompt).toContain("主题必须由你自由选择");
    const reviewPrompt = buildSemanticReviewMessages("候选格言", [
      { kind: "favorite", text: "收藏内容29" },
    ])
      .map((item) => item.content)
      .join("\n");
    expect(reviewPrompt).toContain("收藏内容29");
    expect(reviewPrompt).toContain("气势、语气、节奏、句式相似不算语义重复");
    expect(
      buildQuoteGenerationMessages(DEFAULT_DAILY_QUOTE_STYLE, "duplicate").at(
        -1,
      )?.content,
    ).toContain("近期格言重复");
    expect(
      buildQuoteGenerationMessages(
        DEFAULT_DAILY_QUOTE_STYLE,
        "invalid_output",
      ).at(-1)?.content,
    ).toContain("格式校验");
    expect(
      buildQuoteGenerationMessages(
        DEFAULT_DAILY_QUOTE_STYLE,
        "semantic_overlap",
      ).at(-1)?.content,
    ).toContain("核心意思相近");
  });

  it("parses style profiles and rejects copied source fragments", () => {
    const profile = parseDailyQuoteStyleProfile(
      JSON.stringify({
        force: "稳定而有分寸的力量",
        tone: "清醒克制",
        rhythm: "短句和自然停顿",
        sentenceShape: "先观察，再判断",
        imagery: "少量日常意象",
        emotionalTemperature: "温和不甜腻",
        rhetoric: "自然对照",
        avoid: ["古风腔", "口号化"],
      }),
    );
    expect(profile.tone).toBe("清醒克制");
    expect(
      styleProfileContainsSourceText(profile, ["一盏灯照亮漫长的夜路"]),
    ).toBe(false);
    expect(
      styleProfileContainsSourceText(
        { ...profile, tone: "一盏灯照亮漫长的夜路" },
        ["一盏灯照亮漫长的夜路"],
      ),
    ).toBe(true);
    expect(() => parseDailyQuoteStyleProfile('{"tone":"只有一项"}')).toThrow();
  });

  it("parses semantic review without confusing style with meaning", () => {
    expect(
      parseDailyQuoteSemanticReview(
        '{"sameMeaning":false,"reason":"只共享克制语气，核心命题不同"}',
      ),
    ).toEqual({
      sameMeaning: false,
      reason: "只共享克制语气，核心命题不同",
    });
    expect(() =>
      parseDailyQuoteSemanticReview('{"sameMeaning":"false"}'),
    ).toThrow();
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
    expect(normalizeQuoteText(" 稳稳地走。 ")).toBe("稳稳地走");
  });

  it("classifies safe Edge Function failures without exposing messages", () => {
    expect(classifyUpstreamStatus(401)).toBe("upstream_auth");
    expect(classifyUpstreamStatus(402)).toBe("upstream_quota");
    expect(classifyUpstreamStatus(429)).toBe("upstream_quota");
    expect(classifyUpstreamStatus(400)).toBe("invalid_output");
    expect(classifyUpstreamStatus(503)).toBe("upstream_5xx");
    expect(isRetryableFailureReason("upstream_auth")).toBe(false);
    expect(isRetryableFailureReason("upstream_quota")).toBe(false);
    expect(isRetryableFailureReason("upstream_timeout")).toBe(true);
    expect(isRetryableFailureReason("upstream_5xx")).toBe(true);
    expect(isRetryableFailureReason("invalid_output")).toBe(true);
    expect(isRetryableFailureReason("duplicate")).toBe(true);
    expect(isRetryableFailureReason("semantic_overlap")).toBe(true);
    expect(safeUpstreamCode("insufficient_balance")).toBe(
      "insufficient_balance",
    );
    expect(safeUpstreamCode("secret message with spaces")).toBeNull();
    expect(
      failureBody(
        new DailyQuoteGenerationFailure(
          "upstream_quota",
          402,
          "insufficient_balance",
        ),
        "00000000-0000-4000-8000-000000000001",
      ),
    ).toEqual({
      error: "quote_generation_failed",
      reason: "upstream_quota",
      requestId: "00000000-0000-4000-8000-000000000001",
    });
  });
});
