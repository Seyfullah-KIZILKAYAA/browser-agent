/**
 * Browser-safe entrypoint: everything the engine needs to run INSIDE an MV3
 * extension (or any browser context), with NO Node-only dependencies.
 *
 * Excludes: playwright-session (playwright-core), workflow/batch, data/parse,
 * telemetry/trace, compiler — all of which import node:fs / node:crypto or
 * playwright. The extension provides its own BrowserSession implementation.
 */
export type { BrowserSession, TabInfo } from "./transport/session";
export * from "./perception/snapshot";
export * from "./perception/tokens";
export * from "./perception/vision";
export * from "./perception/page-script";
export * from "./perception/som-script";
export * from "./locator/resolve";
export * from "./security/allowlist";
export * from "./security/approval";
export * from "./human/behavior";
export * from "./human/stealth";
export * from "./llm/provider";
export * from "./llm/openai-provider";
export * from "./llm/gemini-provider";
export * from "./llm/factory";
export * from "./llm/budget";
export * from "./llm/router";
export * from "./llm/pricing";
export * from "./agent/navigator";
export * from "./agent/recorder";
export * from "./agent/memory";
export * from "./agent/healer";
export * from "./agent/prompts";
export * from "./agent/json";
export * from "./memory/site-profile";
