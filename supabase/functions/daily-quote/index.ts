import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import {
  buildDailyQuoteMessages,
  isDailyQuoteDuplicate,
  normalizePromptInput,
  parseDailyQuoteResponse,
} from "./prompt.ts";

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

function response(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
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

  const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
  if (!apiKey) return response(503, { error: "quote_service_unconfigured" });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response(400, { error: "invalid_request" });
  }
  const input = normalizePromptInput(body);
  const messages = buildDailyQuoteMessages(input);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const deepseek = await fetch(
        "https://api.deepseek.com/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages,
            temperature: attempt === 0 ? 0.75 : 0.6,
            max_tokens: 100,
            response_format: { type: "json_object" },
          }),
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (!deepseek.ok)
        throw new Error(`DeepSeek request failed: ${deepseek.status}`);
      const result = (await deepseek.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const text = parseDailyQuoteResponse(
        result.choices?.[0]?.message?.content,
      );
      if (isDailyQuoteDuplicate(text, input.recent))
        throw new Error("Daily quote duplicates recent content");
      return response(200, { text });
    } catch {
      if (attempt === 1)
        return response(502, { error: "quote_generation_failed" });
    }
  }
  return response(502, { error: "quote_generation_failed" });
});
