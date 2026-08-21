import { AnthropicProvider, LLMProvider } from "./provider";
import { deepSeek, groq, ollama, openAI, openRouter, OpenAIProvider } from "./openai-provider";
import { GeminiProvider } from "./gemini-provider";

function env(name: string): string | undefined {
  return typeof process !== "undefined" ? process.env[name] : undefined;
}

export type ProviderName =
  | "anthropic"
  | "openai"
  | "gemini"
  | "openrouter"
  | "deepseek"
  | "groq"
  | "ollama"
  | "custom";

export interface ProviderConfig {
  provider: ProviderName;
  model: string;
  apiKey?: string;
  /** For "custom" (any OpenAI-compatible endpoint) or overriding a default host. */
  baseUrl?: string;
}

/** Build an LLMProvider from an explicit config. */
export function makeProvider(cfg: ProviderConfig): LLMProvider {
  switch (cfg.provider) {
    case "anthropic":
      return new AnthropicProvider(cfg.model, cfg.apiKey);
    case "openai":
      return openAI(cfg.model, cfg.apiKey);
    case "openrouter":
      return openRouter(cfg.model, cfg.apiKey);
    case "deepseek":
      return deepSeek(cfg.model, cfg.apiKey);
    case "groq":
      return groq(cfg.model, cfg.apiKey);
    case "ollama":
      return ollama(cfg.model, cfg.baseUrl);
    case "gemini":
      return new GeminiProvider(cfg.model, cfg.apiKey);
    case "custom":
      return new OpenAIProvider({ model: cfg.model, apiKey: cfg.apiKey, baseUrl: cfg.baseUrl });
    default: {
      const never: never = cfg.provider;
      throw new Error(`Unknown provider: ${String(never)}`);
    }
  }
}

const KNOWN_PROVIDERS: ProviderName[] = [
  "anthropic", "openai", "gemini", "openrouter", "deepseek", "groq", "ollama", "custom",
];

/** Sensible default model per provider when none is given. */
function defaultModel(provider: ProviderName): string {
  switch (provider) {
    case "anthropic": return "claude-sonnet-5";
    case "openai": return "gpt-4o-mini";
    case "gemini": return "gemini-2.0-flash";
    case "openrouter": return "anthropic/claude-3.5-sonnet";
    case "deepseek": return "deepseek-chat";
    case "groq": return "openai/gpt-oss-20b";
    case "ollama": return "llama3.1";
    case "custom": return "gpt-4o-mini";
  }
}

/**
 * Build a provider from environment: BA_PROVIDER selects the vendor, BA_MODEL
 * (or the tier-specific model) selects the model, provider-specific *_API_KEY
 * supplies the key. If BA_PROVIDER is unset, auto-detect from whichever key is
 * present (Anthropic → OpenAI → Gemini → DeepSeek → Groq → Ollama).
 */
export function providerFromEnv(model?: string): LLMProvider {
  const name = (env("BA_PROVIDER") ?? autoDetect()) as ProviderName;
  if (!KNOWN_PROVIDERS.includes(name)) {
    throw new Error(`Bilinmeyen BA_PROVIDER="${name}". Seçenekler: ${KNOWN_PROVIDERS.join(", ")}`);
  }
  return makeProvider({
    provider: name,
    model: model ?? env("BA_MODEL") ?? defaultModel(name),
    baseUrl: env("BA_BASE_URL"),
  });
}

function autoDetect(): ProviderName {
  if (env("ANTHROPIC_API_KEY")) return "anthropic";
  if (env("OPENAI_API_KEY")) return "openai";
  if (env("GEMINI_API_KEY") || env("GOOGLE_API_KEY")) return "gemini";
  if (env("OPENROUTER_API_KEY")) return "openrouter";
  if (env("DEEPSEEK_API_KEY")) return "deepseek";
  if (env("GROQ_API_KEY")) return "groq";
  // Ollama needs no key; last resort so a local model "just works".
  return "ollama";
}

/**
 * Whether any LLM provider is usable from the environment: a vendor key is set,
 * or BA_PROVIDER is explicitly "ollama"/"custom" (which may need no key).
 * Used by CLI/extension to give a clear message before starting a live run.
 */
export function hasAnyProviderConfigured(): boolean {
  const explicit = env("BA_PROVIDER");
  if (explicit === "ollama" || explicit === "custom") return true;
  return Boolean(
    env("ANTHROPIC_API_KEY") ||
      env("OPENAI_API_KEY") ||
      env("GEMINI_API_KEY") ||
      env("GOOGLE_API_KEY") ||
      env("OPENROUTER_API_KEY") ||
      env("DEEPSEEK_API_KEY") ||
      env("GROQ_API_KEY"),
  );
}
