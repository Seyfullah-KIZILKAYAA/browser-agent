/**
 * Per-model pricing (USD per million tokens). Prompt caching changes the input
 * rate: cache reads bill ~10% of base, cache writes ~125%. These are defaults
 * for cost estimation only — override via setPricing when rates change.
 */
export interface ModelPrice {
  /** USD per 1M input tokens (uncached). */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
}

const PER_MILLION: Record<string, ModelPrice> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-fable-5": { input: 5, output: 25 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};

const DEFAULT_PRICE: ModelPrice = { input: 3, output: 15 };

/** Override or add a model's price (USD per 1M tokens). */
export function setPricing(model: string, price: ModelPrice): void {
  PER_MILLION[model] = price;
}

export function priceOf(model: string | undefined): ModelPrice {
  return (model && PER_MILLION[model]) || DEFAULT_PRICE;
}

/** Estimate USD for one usage record, accounting for cache read/write rates. */
export function usageCostUsd(usage: {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  model?: string;
}): number {
  const p = priceOf(usage.model);
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  // Anthropic's input_tokens excludes cached tokens; bill them at their own rates.
  const freshInput = usage.inputTokens;
  const usd =
    (freshInput / 1_000_000) * p.input +
    (cacheRead / 1_000_000) * p.input * 0.1 +
    (cacheWrite / 1_000_000) * p.input * 1.25 +
    (usage.outputTokens / 1_000_000) * p.output;
  return usd;
}
