import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import {
  generateDailyQuote,
  type DailyQuoteCompletionRequest,
} from "./pipeline.ts";
import {
  DailyQuoteGenerationFailure,
  classifyUpstreamStatus,
  failureBody,
  isTimeoutError,
  safeUpstreamCode,
} from "./errors.ts";
import type { DailyQuotePipelineStage } from "./pipeline.ts";

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
  stage: DailyQuotePipelineStage = "generation",
): void {
  console.error(
    JSON.stringify({
      event: "daily_quote_generation_failed",
      requestId,
      stage,
      attempt,
      reason: failure.reason,
      upstreamStatus: failure.upstreamStatus,
      upstreamCode: failure.upstreamCode,
    }),
  );
}

async function requestDeepSeek(
  apiKey: string,
  request: DailyQuoteCompletionRequest,
): Promise<string> {
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
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
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
  try {
    const result = (await deepseek.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    if (typeof result.choices?.[0]?.message?.content !== "string")
      throw new Error("模型响应为空");
    return result.choices[0].message.content;
  } catch {
    throw new DailyQuoteGenerationFailure("invalid_output");
  }
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
  try {
    const text = await generateDailyQuote(
      body,
      (completionRequest) => requestDeepSeek(apiKey, completionRequest),
      (stage, attempt, failure) =>
        logFailure(requestId, attempt, failure, stage),
    );
    return response(200, { text });
  } catch (error) {
    const failure =
      error instanceof DailyQuoteGenerationFailure
        ? error
        : new DailyQuoteGenerationFailure("invalid_output");
    return response(502, failureBody(failure, requestId));
  }
});
