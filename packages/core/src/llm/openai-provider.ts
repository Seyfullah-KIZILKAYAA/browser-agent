import { LLMMessage, LLMProvider, LLMResponse, sanitizeHeaderValue } from "./provider";

function env(name: string): string | undefined {
  return typeof process !== "undefined" ? process.env[name] : undefined;
}

export interface OpenAICompatibleOptions {
  model?: string;
  apiKey?: string;
  /** Base URL of the Chat Completions endpoint's host. Defaults to OpenAI. */
  baseUrl?: string;
}

/**
 * OpenAI Chat Completions provider. Because the format is a de-facto standard,
 * the same class drives OpenAI, OpenRouter, DeepSeek, Groq, Together, LM Studio
 * and Ollama (OpenAI-compatible mode) — just point baseUrl/apiKey at them.
 *
 * Ready-made factories: openAI(), openRouter(), deepSeek(), groq(), ollama().
 */
export class OpenAIProvider implements LLMProvider {
  private model: string;
  private apiKey: string | undefined;
  private baseUrl: string;

  constructor(opts: OpenAICompatibleOptions = {}) {
    this.model = opts.model ?? env("BA_MODEL") ?? "gpt-4o-mini";
    this.apiKey = opts.apiKey ?? env("OPENAI_API_KEY");
    this.baseUrl = (opts.baseUrl ?? env("OPENAI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/$/, "");
  }

  async complete(opts: { system: string; messages: LLMMessage[]; maxTokens?: number }): Promise<LLMResponse> {
    const messages = [
      { role: "system", content: opts.system },
      ...opts.messages.map((m) => {
        if (!m.imageBase64) return { role: m.role, content: m.content };
        const url = m.imageBase64.startsWith("data:")
          ? m.imageBase64
          : `data:image/jpeg;base64,${m.imageBase64}`;
        return {
          role: m.role,
          content: [
            { type: "text", text: m.content },
            { type: "image_url", image_url: { url } },
          ],
        };
      }),
    ];

    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.apiKey) headers["authorization"] = `Bearer ${sanitizeHeaderValue(this.apiKey, "API anahtarı")}`;

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: opts.maxTokens ?? 1024,
      messages,
      // Every agent prompt asks for a single JSON object. Forcing JSON mode
      // stops tool-calling models (e.g. Groq's gpt-oss) from emitting a tool
      // call instead of text, which would 400 with "tool_use_failed".
      response_format: { type: "json_object" },
      // Belt-and-suspenders: explicitly forbid tool use even if the endpoint
      // has tools configured server-side.
      tool_choice: "none",
    };

    let res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    // Some endpoints reject response_format/tool_choice; retry without them.
    if (res.status === 400) {
      const errText = await res.clone().text();
      if (/response_format|tool_choice|json_object|not supported|unknown/i.test(errText)) {
        delete body.response_format;
        delete body.tool_choice;
        res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
      }
    }
    if (!res.ok) {
      throw new Error(`OpenAI-compatible API error ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: data.choices[0]?.message?.content ?? "",
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        model: this.model,
      },
    };
  }
}

/** OpenAI proper (api.openai.com). */
export function openAI(model = "gpt-4o-mini", apiKey?: string): OpenAIProvider {
  return new OpenAIProvider({ model, apiKey });
}

/** OpenRouter — one key, hundreds of models (openai/…, anthropic/…, google/…). */
export function openRouter(model: string, apiKey?: string): OpenAIProvider {
  return new OpenAIProvider({
    model,
    apiKey: apiKey ?? env("OPENROUTER_API_KEY"),
    baseUrl: "https://openrouter.ai/api/v1",
  });
}

/** DeepSeek (deepseek-chat, deepseek-reasoner). */
export function deepSeek(model = "deepseek-chat", apiKey?: string): OpenAIProvider {
  return new OpenAIProvider({
    model,
    apiKey: apiKey ?? env("DEEPSEEK_API_KEY"),
    baseUrl: "https://api.deepseek.com/v1",
  });
}

/** Groq (fast open-model hosting). */
export function groq(model = "openai/gpt-oss-20b", apiKey?: string): OpenAIProvider {
  return new OpenAIProvider({
    model,
    apiKey: apiKey ?? env("GROQ_API_KEY"),
    baseUrl: "https://api.groq.com/openai/v1",
  });
}

/** Local Ollama in OpenAI-compatible mode (no API key needed). */
export function ollama(model = "llama3.1", baseUrl = env("OLLAMA_BASE_URL") ?? "http://localhost:11434/v1"): OpenAIProvider {
  return new OpenAIProvider({ model, apiKey: "ollama", baseUrl });
}
