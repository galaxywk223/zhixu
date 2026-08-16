import { DailyQuoteGenerationFailure } from "./errors.ts";
import {
  DEFAULT_DAILY_QUOTE_STYLE,
  buildQuoteGenerationMessages,
  buildSemanticReviewMessages,
  buildStyleProfileMessages,
  isDailyQuoteDuplicate,
  normalizePromptInput,
  parseDailyQuoteResponse,
  parseDailyQuoteSemanticReview,
  parseDailyQuoteStyleProfile,
  styleProfileContainsSourceText,
  type DailyQuoteMessage,
  type DailyQuoteSemanticReference,
  type DailyQuoteStyleProfile,
} from "./prompt.ts";

export type DailyQuotePipelineStage =
  "style" | "generation" | "semantic_review";

export interface DailyQuoteCompletionRequest {
  stage: DailyQuotePipelineStage;
  attempt: number;
  messages: DailyQuoteMessage[];
  temperature: number;
  maxTokens: number;
}

export type DailyQuoteCompletion = (
  request: DailyQuoteCompletionRequest,
) => Promise<string>;

export type DailyQuoteFailureObserver = (
  stage: DailyQuotePipelineStage,
  attempt: number,
  failure: DailyQuoteGenerationFailure,
) => void;

function asFailure(error: unknown): DailyQuoteGenerationFailure {
  return error instanceof DailyQuoteGenerationFailure
    ? error
    : new DailyQuoteGenerationFailure("invalid_output");
}

function buildSemanticReferences(
  input: ReturnType<typeof normalizePromptInput>,
): DailyQuoteSemanticReference[] {
  return [
    ...input.favorites.map((text) => ({ kind: "favorite" as const, text })),
    ...input.dislikes.map((text) => ({ kind: "dislike" as const, text })),
    ...input.recent.map((text) => ({ kind: "recent" as const, text })),
  ];
}

async function createStyleProfile(
  input: ReturnType<typeof normalizePromptInput>,
  complete: DailyQuoteCompletion,
  observeFailure: DailyQuoteFailureObserver,
): Promise<DailyQuoteStyleProfile> {
  if (input.favorites.length === 0) return DEFAULT_DAILY_QUOTE_STYLE;
  let lastFailure = new DailyQuoteGenerationFailure("invalid_output");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const content = await complete({
        stage: "style",
        attempt: attempt + 1,
        messages: buildStyleProfileMessages(input),
        temperature: 0.2,
        maxTokens: 320,
      });
      let profile: DailyQuoteStyleProfile;
      try {
        profile = parseDailyQuoteStyleProfile(content);
      } catch {
        throw new DailyQuoteGenerationFailure("invalid_output");
      }
      if (styleProfileContainsSourceText(profile, input.favorites))
        throw new DailyQuoteGenerationFailure("invalid_output");
      return profile;
    } catch (error) {
      lastFailure = asFailure(error);
      observeFailure("style", attempt + 1, lastFailure);
      if (!lastFailure.retryable) break;
    }
  }
  throw lastFailure;
}

export async function generateDailyQuote(
  value: unknown,
  complete: DailyQuoteCompletion,
  observeFailure: DailyQuoteFailureObserver = () => undefined,
): Promise<string> {
  const input = normalizePromptInput(value);
  const styleProfile = await createStyleProfile(
    input,
    complete,
    observeFailure,
  );
  const semanticReferences = buildSemanticReferences(input);
  let retryReason:
    "invalid_output" | "duplicate" | "semantic_overlap" | undefined;
  let lastFailure = new DailyQuoteGenerationFailure("upstream_5xx");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const content = await complete({
        stage: "generation",
        attempt: attempt + 1,
        messages: buildQuoteGenerationMessages(styleProfile, retryReason),
        temperature: [0.85, 0.78, 0.72][attempt]!,
        maxTokens: 120,
      });
      let text: string;
      try {
        text = parseDailyQuoteResponse(content);
      } catch {
        throw new DailyQuoteGenerationFailure("invalid_output");
      }
      if (isDailyQuoteDuplicate(text, input.recent))
        throw new DailyQuoteGenerationFailure("duplicate");

      if (semanticReferences.length > 0) {
        const reviewContent = await complete({
          stage: "semantic_review",
          attempt: attempt + 1,
          messages: buildSemanticReviewMessages(text, semanticReferences),
          temperature: 0.1,
          maxTokens: 120,
        });
        let review;
        try {
          review = parseDailyQuoteSemanticReview(reviewContent);
        } catch {
          throw new DailyQuoteGenerationFailure("invalid_output");
        }
        if (review.sameMeaning)
          throw new DailyQuoteGenerationFailure("semantic_overlap");
      }
      return text;
    } catch (error) {
      lastFailure = asFailure(error);
      observeFailure("generation", attempt + 1, lastFailure);
      if (!lastFailure.retryable) break;
      retryReason =
        lastFailure.reason === "invalid_output" ||
        lastFailure.reason === "duplicate" ||
        lastFailure.reason === "semantic_overlap"
          ? lastFailure.reason
          : undefined;
    }
  }
  throw lastFailure;
}
