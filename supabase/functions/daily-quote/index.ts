import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import {
  buildDailyQuoteMessages,
  isDailyQuoteDuplicate,
  normalizePromptInput,
  parseDailyQuoteResponse,
} from "./prompt.ts";
import {
  DailyQuoteGenerationFailure,
  classifyUpstreamStatus,
  failureBody,
  isRetryableFailureReason,
  isTimeoutError,
  safeUpstreamCode,
  type DailyQuoteFailureReason,
} from "./errors.ts";

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

function response(status: number, body: object): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

async function upstreamErrorCode(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as {
      error?: { code?: unknown; type?: unknown };
    };
    return safeUpstreamCode(body.error?.code ?? body.error?.type);
  } catch {
    return null;
  }
}

function logFailure(
  requestId: string,
  attempt: number,
  failure: DailyQuoteGenerationFailure,
): void {
  console.error(
    JSON.stringify({
      event: "daily_quote_generation_failed",
      requestId,
      attempt,
      reason: failure.reason,
      upstreamStatus: failure.upstreamStatus,
      upstreamCode: failure.upstreamCode,
    }),
  );
}

Deno.serve(async (request) => {
  if (request.method !== "POST")
    return response(405, { error: "method_not_allowed" });

  const authorization = request.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!authorization || !supabaseUrl || !supabaseAnonKey)
    return response(401, { error: "authentication_required" });

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authorization.replace(/^Bearer\s+/i, "");
  const { data, error: authError } = await supabase.auth.getUser(token);
  if (authError || !data.user)
    return response(401, { error: "authentication_required" });

  const requestId = crypto.randomUUID();
  const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
  if (!apiKey) {
    const failure = new DailyQuoteGenerationFailure(
      "upstream_auth",
      null,
      "missing_api_key",
    );
    logFailure(requestId, 0, failure);
    return response(503, failureBody(failure, requestId));
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response(400, { error: "invalid_request" });
  }
  const input = normalizePromptInput(body);
  let retryReason:
    | Extract<DailyQuoteFailureReason, "invalid_output" | "duplicate">
    | undefined;
  let lastFailure = new DailyQuoteGenerationFailure("upstream_5xx");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      let deepseek: Response;
      try {
        deepseek = await fetch("https://api.deepseek.com/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: buildDailyQuoteMessages(input, retryReason),
            temperature: [0.75, 0.65, 0.55][attempt],
            max_tokens: 120,
            response_format: { type: "json_object" },
          }),
          signal: AbortSignal.timeout(20_000),
        });
      } catch (error) {
        throw new DailyQuoteGenerationFailure(
          isTimeoutError(error) ? "upstream_timeout" : "upstream_5xx",
        );
      }
      if (!deepseek.ok)
        throw new DailyQuoteGenerationFailure(
          classifyUpstreamStatus(deepseek.status),
          deepseek.status,
          await upstreamErrorCode(deepseek),
        );

      let text: string;
      try {
        const result = (await deepseek.json()) as {
          choices?: Array<{ message?: { content?: unknown } }>;
        };
        text = parseDailyQuoteResponse(result.choices?.[0]?.message?.content);
      } catch {
        throw new DailyQuoteGenerationFailure("invalid_output");
      }
      if (isDailyQuoteDuplicate(text, input.recent))
        throw new DailyQuoteGenerationFailure("duplicate");
      return response(200, { text });
    } catch (error) {
      lastFailure =
        error instanceof DailyQuoteGenerationFailure
          ? error
          : new DailyQuoteGenerationFailure("invalid_output");
      logFailure(requestId, attempt + 1, lastFailure);
      if (!isRetryableFailureReason(lastFailure.reason)) break;
      retryReason =
        lastFailure.reason === "invalid_output" ||
        lastFailure.reason === "duplicate"
          ? lastFailure.reason
          : undefined;
    }
  }
  return response(502, failureBody(lastFailure, requestId));
});
