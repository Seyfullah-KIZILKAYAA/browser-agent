import { AnthropicProvider, LLMProvider } from "./provider";
import { providerFromEnv, makeProvider, ProviderName } from "./factory";

/**
 * Model routing: strong model for planning/compiling/healing (hard reasoning),
 * cheap model for per-step navigation and validation (high volume, low stakes).
 * Provider-agnostic — each tier can even be a different vendor.
 */
export interface ModelRouter {
  planner(): LLMProvider;
  navigator(): LLMProvider;
  validator(): LLMProvider;
  healer(): LLMProvider;
  vision(): LLMProvider;
}

export interface RouterModels {
  strong: string;
  cheap: string;
  vision: string;
}

function env(name: string): string | undefined {
  return typeof process !== "undefined" ? process.env[name] : undefined;
}

export const DEFAULT_MODELS: RouterModels = {
  strong: env("BA_MODEL_STRONG") ?? "claude-opus-5",
  cheap: env("BA_MODEL_CHEAP") ?? "claude-sonnet-5",
  vision: env("BA_MODEL_VISION") ?? "claude-sonnet-5",
};

/** Anthropic-backed router (kept for back-compat). */
export function makeAnthropicRouter(models: RouterModels = DEFAULT_MODELS): ModelRouter {
  const strong = new AnthropicProvider(models.strong);
  const cheap = new AnthropicProvider(models.cheap);
  const vision = new AnthropicProvider(models.vision);
  return {
    planner: () => strong,
    navigator: () => cheap,
    validator: () => cheap,
    healer: () => strong,
    vision: () => vision,
  };
}

/** Build a router from explicit providers (any vendor per tier). */
export function makeRouter(providers: {
  strong: LLMProvider;
  cheap: LLMProvider;
  vision: LLMProvider;
}): ModelRouter {
  return {
    planner: () => providers.strong,
    navigator: () => providers.cheap,
    validator: () => providers.cheap,
    healer: () => providers.strong,
    vision: () => providers.vision,
  };
}

/**
 * Build a router from environment. BA_PROVIDER picks the vendor (auto-detected
 * from whichever *_API_KEY is set if unset); BA_MODEL_STRONG/CHEAP/VISION pick
 * the per-tier models. Vision falls back to the cheap model when unset.
 */
export function routerFromEnv(): ModelRouter {
  const providerName = env("BA_PROVIDER") as ProviderName | undefined;
  // If a vision-capable tier model is set for a non-vision provider, that's on
  // the user; we just wire the models through the selected provider.
  const strong = providerFromEnv(env("BA_MODEL_STRONG"));
  const cheap = providerFromEnv(env("BA_MODEL_CHEAP"));
  const visionModel = env("BA_MODEL_VISION");
  const vision = visionModel
    ? (providerName
        ? makeProvider({ provider: providerName, model: visionModel, baseUrl: env("BA_BASE_URL") })
        : providerFromEnv(visionModel))
    : cheap;
  return makeRouter({ strong, cheap, vision });
}
