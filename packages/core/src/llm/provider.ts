export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
  /** Optional image (data: URL or raw base64 JPEG/PNG) for vision fallback. */
  imageBase64?: string;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  /** Input tokens read from the prompt cache (billed ~10% of normal). */
  cacheReadTokens?: number;
  /** Input tokens written to the prompt cache (billed ~125% of normal). */
  cacheWriteTokens?: number;
  /** Model id that produced this usage, for per-model cost attribution. */
  model?: string;
}

export interface LLMResponse {
  text: string;
  usage: LLMUsage;
}

/** Thin provider interface — no framework, token accounting stays in our hands. */
export interface LLMProvider {
  complete(opts: {
    system: string;
    messages: LLMMessage[];
    maxTokens?: number;
  }): Promise<LLMResponse>;
}

/** Read an env var safely in both Node and browser (extension) contexts. */
function env(name: string): string | undefined {
  return typeof process !== "undefined" ? process.env[name] : undefined;
}

/**
 * Clean a value destined for an HTTP header. fetch() only allows ISO-8859-1 in
 * headers, so a stray unicode char (invisible space, smart quote, Turkish
 * letter from a bad copy-paste) in an API key crashes with a cryptic message.
 * We strip surrounding whitespace/zero-width chars and fail with a clear error
 * if a non-Latin-1 code point remains.
 */
export function sanitizeHeaderValue(value: string, label: string): string {
  const cleaned = value.trim().replace(/[​-‍﻿]/g, "");
  for (const ch of cleaned) {
    if (ch.codePointAt(0)! > 0xff) {
      throw new Error(
        `${label} geçersiz bir karakter içeriyor ("${ch}"). Anahtarı yeniden kopyalayıp yapıştır — ` +
          `görünmez boşluk veya Türkçe/özel karakter içermemeli.`,
      );
    }
  }
  return cleaned;
}

/** Parse a wait time (seconds) from a Retry-After header or a rate-limit message. */
function retryDelayMs(res: Response, bodyText: string): number {
  const header = res.headers.get("retry-after");
  if (header) {
    const secs = Number(header);
    if (Number.isFinite(secs)) return Math.min(secs * 1000, 30_000);
  }
  // Groq/OpenAI put "try again in 1.75s" (or "...in 500ms") in the message.
  const m = bodyText.match(/try again in\s+([\d.]+)\s*(ms|s)/i);
  if (m) {
    const val = Number(m[1]);
    const unit = (m[2] ?? "s").toLowerCase();
    return Math.min(unit === "ms" ? val : val * 1000, 30_000);
  }
  return 2000; // sensible default backoff
}

/**
 * fetch() that transparently waits out rate limits (429) and transient server
 * errors (500/502/503/529), honoring Retry-After / "try again in Xs". Returns
 * the final Response (which may still be an error) after up to `maxRetries`.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: { maxRetries?: number; onWait?: (ms: number, attempt: number) => void } = {},
): Promise<Response> {
  const maxRetries = opts.maxRetries ?? 4;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    const retriable = res.status === 429 || res.status === 500 || res.status === 502 || res.status === 503 || res.status === 529;
    if (!retriable || attempt >= maxRetries) return res;
    const text = await res.clone().text();
    // A 400 tool_use_failed is NOT retriable here (handled by the caller).
    const base = retryDelayMs(res, text);
    // Exponential-ish backoff on top of the server hint, capped.
    const wait = Math.min(base + attempt * 500, 30_000);
    opts.onWait?.(wait, attempt + 1);
    await new Promise((r) => setTimeout(r, wait));
  }
}

/** Anthropic Messages API via fetch. Requires ANTHROPIC_API_KEY. */
export class AnthropicProvider implements LLMProvider {
  constructor(
    private model: string = env("BA_MODEL") ?? "claude-sonnet-5",
    private apiKey: string | undefined = env("ANTHROPIC_API_KEY"),
  ) {}

  async complete(opts: {
    system: string;
    messages: LLMMessage[];
    maxTokens?: number;
  }): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set — COMPILE/HEAL modes need it. EXECUTE mode works without it.");
    }
    const res = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": sanitizeHeaderValue(this.apiKey, "ANTHROPIC_API_KEY"),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: opts.maxTokens ?? 1024,
        // Static system prompt goes first so provider-side prompt caching applies.
        system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
        messages: opts.messages.map((m) => {
          if (!m.imageBase64) return { role: m.role, content: m.content };
          const b64 = m.imageBase64.replace(/^data:image\/\w+;base64,/, "");
          return {
            role: m.role,
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
              { type: "text", text: m.content },
            ],
          };
        }),
      }),
    });
    if (!res.ok) {
      throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      content: { type: string; text?: string }[];
      usage: {
        input_tokens: number;
        output_tokens: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      };
    };
    const text = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
    return {
      text,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        cacheReadTokens: data.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: data.usage.cache_creation_input_tokens ?? 0,
        model: this.model,
      },
    };
  }
}
