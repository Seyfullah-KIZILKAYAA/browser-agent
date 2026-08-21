import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAIProvider, openRouter, deepSeek, ollama, recoverFromToolCall } from "../src/llm/openai-provider";
import { GeminiProvider } from "../src/llm/gemini-provider";
import { AnthropicProvider } from "../src/llm/provider";
import { makeProvider, providerFromEnv, hasAnyProviderConfigured } from "../src/llm/factory";

function mockFetch(responseJson: unknown) {
  const make = () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => responseJson,
    text: async () => JSON.stringify(responseJson),
    clone() {
      return make();
    },
  });
  const spy = vi.fn(async () => make());
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OpenAI-compatible provider", () => {
  it("sends system + user messages and parses the choice", async () => {
    const spy = mockFetch({
      choices: [{ message: { content: "merhaba" } }],
      usage: { prompt_tokens: 10, completion_tokens: 3 },
    });
    const p = new OpenAIProvider({ model: "gpt-4o-mini", apiKey: "k", baseUrl: "https://x/v1" });
    const res = await p.complete({ system: "sen bir botsun", messages: [{ role: "user", content: "selam" }] });

    expect(res.text).toBe("merhaba");
    expect(res.usage.inputTokens).toBe(10);
    expect(res.usage.outputTokens).toBe(3);
    const body = JSON.parse(spy.mock.calls[0]![1].body);
    expect(body.messages[0]).toEqual({ role: "system", content: "sen bir botsun" });
    expect(body.messages[1]).toEqual({ role: "user", content: "selam" });
    expect(spy.mock.calls[0]![0]).toBe("https://x/v1/chat/completions");
    // JSON mode nudges tool-calling models toward text. We do NOT send
    // tool_choice:"none" — with gpt-oss it triggers a 400 instead.
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.tool_choice).toBeUndefined();
  });

  it("attaches an image for vision", async () => {
    const spy = mockFetch({ choices: [{ message: { content: "ok" } }] });
    const p = new OpenAIProvider({ apiKey: "k" });
    await p.complete({ system: "s", messages: [{ role: "user", content: "bak", imageBase64: "AAAA" }] });
    const body = JSON.parse(spy.mock.calls[0]![1].body);
    expect(body.messages[1].content[1].type).toBe("image_url");
  });

  it("factory hosts point at the right base URLs", () => {
    expect((openRouter("m", "k") as unknown as { baseUrl: string }).baseUrl).toContain("openrouter.ai");
    expect((deepSeek("m", "k") as unknown as { baseUrl: string }).baseUrl).toContain("deepseek.com");
    expect((ollama("m") as unknown as { baseUrl: string }).baseUrl).toContain("11434");
  });

  it("retries without response_format when the endpoint rejects it", async () => {
    let call = 0;
    const spy = vi.fn(async () => {
      call++;
      if (call === 1) {
        const body = { error: { message: "response_format is not supported" } };
        return {
          ok: false,
          status: 400,
          json: async () => body,
          text: async () => JSON.stringify(body),
          clone() {
            return { text: async () => JSON.stringify(body) };
          },
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "ikinci deneme" } }] }),
        text: async () => "",
        clone() {
          return this;
        },
      };
    });
    vi.stubGlobal("fetch", spy);
    const p = new OpenAIProvider({ apiKey: "k" });
    const res = await p.complete({ system: "s", messages: [{ role: "user", content: "q" }] });
    expect(res.text).toBe("ikinci deneme");
    expect(spy).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(spy.mock.calls[1]![1].body);
    expect(retryBody.response_format).toBeUndefined();
  });

  it("recovers a tool call from a Groq 400 into our action JSON", async () => {
    // The exact error Groq's gpt-oss returns when it emits a tool call.
    const errBody = {
      error: {
        message: "Tool choice is none, but model called a tool",
        code: "tool_use_failed",
        failed_generation: JSON.stringify({
          name: "browser.type",
          arguments: { index: 6, value: "en ucuz satıcı" },
        }),
      },
    };
    const spy = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => errBody,
      text: async () => JSON.stringify(errBody),
      clone() {
        return { text: async () => JSON.stringify(errBody) };
      },
    }));
    vi.stubGlobal("fetch", spy);
    const p = new OpenAIProvider({ apiKey: "k" });
    const res = await p.complete({ system: "s", messages: [{ role: "user", content: "q" }] });
    const parsed = JSON.parse(res.text);
    expect(parsed.action.type).toBe("type");
    expect(parsed.action.index).toBe(6);
    expect(parsed.action.value).toBe("en ucuz satıcı");
    expect(parsed.risk).toBe("write"); // type is a write action
    expect(spy).toHaveBeenCalledTimes(1); // recovered, no retry needed
  });
});

describe("recoverFromToolCall", () => {
  it("maps browser.click to a click action", () => {
    const err = JSON.stringify({
      error: { failed_generation: JSON.stringify({ name: "browser.click", arguments: { index: 3 } }) },
    });
    const out = JSON.parse(recoverFromToolCall(err)!);
    expect(out.action).toEqual({ type: "click", index: 3 });
    expect(out.risk).toBe("write");
  });

  it("honors an explicit args.type over the tool name", () => {
    const err = JSON.stringify({
      error: { failed_generation: JSON.stringify({ name: "browser.action", arguments: { type: "navigate", url: "https://x.com" } }) },
    });
    const out = JSON.parse(recoverFromToolCall(err)!);
    expect(out.action.type).toBe("navigate");
    expect(out.action.url).toBe("https://x.com");
    expect(out.risk).toBe("read"); // navigate is not a write
  });

  it("returns null when there is nothing to recover", () => {
    expect(recoverFromToolCall('{"error":{"message":"rate limited"}}')).toBeNull();
    expect(recoverFromToolCall("not json at all")).toBeNull();
  });
});

describe("rate-limit retry", () => {
  it("waits out a 429 then succeeds", async () => {
    let call = 0;
    const spy = vi.fn(async () => {
      call++;
      if (call === 1) {
        const body = { error: { message: "Rate limit reached. Please try again in 0s." } };
        return {
          ok: false,
          status: 429,
          headers: { get: (h: string) => (h.toLowerCase() === "retry-after" ? "0" : null) },
          json: async () => body,
          text: async () => JSON.stringify(body),
          clone() {
            return { text: async () => JSON.stringify(body) };
          },
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ choices: [{ message: { content: "429 sonrası başarı" } }] }),
        text: async () => "",
        clone() {
          return this;
        },
      };
    });
    vi.stubGlobal("fetch", spy);
    const p = new OpenAIProvider({ apiKey: "k" });
    const res = await p.complete({ system: "s", messages: [{ role: "user", content: "q" }] });
    expect(res.text).toBe("429 sonrası başarı");
    expect(spy).toHaveBeenCalledTimes(2); // one 429, one success
  });
});

describe("Gemini provider", () => {
  it("uses system_instruction + contents and parses candidates", async () => {
    const spy = mockFetch({
      candidates: [{ content: { parts: [{ text: "yanıt" }] } }],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 },
    });
    const p = new GeminiProvider("gemini-3.6-flash", "k");
    const res = await p.complete({ system: "sistem", messages: [{ role: "user", content: "soru" }] });

    expect(res.text).toBe("yanıt");
    expect(res.usage.inputTokens).toBe(5);
    const body = JSON.parse(spy.mock.calls[0]![1].body);
    expect(body.system_instruction.parts[0].text).toBe("sistem");
    expect(body.contents[0].role).toBe("user");
  });

  it("retries with the suggested model on a 404 deprecation", async () => {
    let call = 0;
    const spy = vi.fn(async (url: string) => {
      call++;
      if (call === 1) {
        const body = {
          error: {
            code: 404,
            message: "This model models/gemini-old is no longer available. Please use models/gemini-3.6-flash instead.",
          },
        };
        return {
          ok: false,
          status: 404,
          headers: { get: () => null },
          json: async () => body,
          text: async () => JSON.stringify(body),
          clone() {
            return { text: async () => JSON.stringify(body) };
          },
        };
      }
      // Second call must target the suggested model.
      expect(url).toContain("gemini-3.6-flash");
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ candidates: [{ content: { parts: [{ text: "kurtarıldı" }] } }] }),
        text: async () => "",
        clone() {
          return this;
        },
      };
    });
    vi.stubGlobal("fetch", spy);
    const p = new GeminiProvider("gemini-old", "k");
    const res = await p.complete({ system: "s", messages: [{ role: "user", content: "q" }] });
    expect(res.text).toBe("kurtarıldı");
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("Anthropic provider", () => {
  it("parses cache token fields", async () => {
    mockFetch({
      content: [{ type: "text", text: "cevap" }],
      usage: { input_tokens: 8, output_tokens: 4, cache_read_input_tokens: 100 },
    });
    const p = new AnthropicProvider("claude-sonnet-5", "k");
    const res = await p.complete({ system: "s", messages: [{ role: "user", content: "q" }] });
    expect(res.text).toBe("cevap");
    expect(res.usage.cacheReadTokens).toBe(100);
  });
});

describe("provider factory", () => {
  it("builds each vendor by name", () => {
    expect(makeProvider({ provider: "openai", model: "gpt-4o", apiKey: "k" })).toBeInstanceOf(OpenAIProvider);
    expect(makeProvider({ provider: "gemini", model: "g", apiKey: "k" })).toBeInstanceOf(GeminiProvider);
    expect(makeProvider({ provider: "anthropic", model: "c", apiKey: "k" })).toBeInstanceOf(AnthropicProvider);
    expect(makeProvider({ provider: "custom", model: "m", baseUrl: "http://x/v1" })).toBeInstanceOf(OpenAIProvider);
  });

  it("respects BA_PROVIDER from env", () => {
    vi.stubEnv("BA_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "k");
    expect(providerFromEnv("gpt-4o")).toBeInstanceOf(OpenAIProvider);
    vi.unstubAllEnvs();
  });

  it("detects a configured provider", () => {
    vi.stubEnv("BA_PROVIDER", "");
    vi.stubEnv("OPENAI_API_KEY", "k");
    expect(hasAnyProviderConfigured()).toBe(true);
    vi.unstubAllEnvs();
  });
});
