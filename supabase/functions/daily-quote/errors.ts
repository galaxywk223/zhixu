export type DailyQuoteFailureReason =
  | "upstream_auth"
  | "upstream_quota"
  | "upstream_timeout"
  | "upstream_5xx"
  | "invalid_output"
  | "duplicate";

export interface DailyQuoteFailureBody {
  error: "quote_generation_failed";
  reason: DailyQuoteFailureReason;
  requestId: string;
}

export class DailyQuoteGenerationFailure extends Error {
  constructor(
    readonly reason: DailyQuoteFailureReason,
    readonly upstreamStatus: number | null = null,
    readonly upstreamCode: string | null = null,
  ) {
    super(reason);
  }
}

export function classifyUpstreamStatus(
  status: number,
): DailyQuoteFailureReason {
  if (status === 401 || status === 403) return "upstream_auth";
  if (status === 402 || status === 429) return "upstream_quota";
  return status >= 500 ? "upstream_5xx" : "invalid_output";
}

export function safeUpstreamCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim();
  return /^[A-Za-z0-9._-]{1,64}$/.test(code) ? code : null;
}

export function isRetryableFailureReason(
  reason: DailyQuoteFailureReason,
): boolean {
  return reason !== "upstream_auth" && reason !== "upstream_quota";
}

export function failureBody(
  failure: DailyQuoteGenerationFailure,
  requestId: string,
): DailyQuoteFailureBody {
  return {
    error: "quote_generation_failed",
    reason: failure.reason,
    requestId,
  };
}

export function isTimeoutError(value: unknown): boolean {
  return (
    value instanceof Error &&
    (value.name === "AbortError" || value.name === "TimeoutError")
  );
}
