import { fetchWithRetry, LLMMessage, LLMProvider, LLMResponse, sanitizeHeaderValue } from "./provider";

function env(name: string): string | undefined {
  return typeof process !== "undefined" ? process.env[name] : undefined;
}

interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

/**
 * Google Gemini provider (generativelanguage API). Uses its own request shape:
 * a system_instruction block + contents[] with role "user"/"model".
 */
export class GeminiProvider implements LLMProvider {
  constructor(
    private model: string = env("BA_MODEL") ?? "gemini-3.6-flash",
    private apiKey: string | undefined = env("GEMINI_API_KEY") ?? env("GOOGLE_API_KEY"),
  ) {}

  async complete(opts: { system: string; messages: LLMMessage[]; maxTokens?: number }): Promise<LLMResponse> {
    if (!this.apiKey) throw new Error("GEMINI_API_KEY (veya GOOGLE_API_KEY) ayarlı değil.");

    const contents = opts.messages.map((m) => {
      const parts: GeminiPart[] = [{ text: m.content }];
      if (m.imageBase64) {
        const b64 = m.imageBase64.replace(/^data:image\/\w+;base64,/, "");
        parts.push({ inline_data: { mime_type: "image/jpeg", data: b64 } });
      }
      return { role: m.role === "assistant" ? "model" : "user", parts };
    });

    const key = sanitizeHeaderValue(this.apiKey, "GEMINI_API_KEY");
    const requestBody = JSON.stringify({
      system_instruction: { parts: [{ text: opts.system }] },
      contents,
      generationConfig: { maxOutputTokens: opts.maxTokens ?? 1024 },
    });
    const callModel = (model: string) =>
      fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        { method: "POST", headers: { "content-type": "application/json" }, body: requestBody },
      );

    let res = await callModel(this.model);
    // Google retires models often; a 404 usually names the replacement. Retry
    // with the suggested model so a deprecation doesn't break the run.
    if (res.status === 404) {
      const errText = await res.clone().text();
      const suggested = errText.match(/use\s+models\/([\w.-]+)/i)?.[1];
      if (suggested && suggested !== this.model) {
        this.model = suggested; // remember for the rest of this run
        res = await callModel(suggested);
      }
    }
    if (!res.ok) {
      throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("");
    return {
      text,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        model: this.model,
      },
    };
  }
}

export function gemini(model = "gemini-2.0-flash", apiKey?: string): GeminiProvider {
  return new GeminiProvider(model, apiKey);
}
