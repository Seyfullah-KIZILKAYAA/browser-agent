import { Target } from "@ba/shared";
import { BrowserSession } from "../transport/session";
import { PAGE_RESOLVE_FN } from "../perception/page-script";

/** CSS selector actions use after a successful resolve. */
export const RESOLVED_SELECTOR = "[data-ba-r='1']";

export interface ResolveResult {
  found: boolean;
  /** Which locator layer matched (role+name, testId, anchor, css, xpath, text). */
  via?: string;
}

/**
 * Resolve a multi-layer target inside the page without any LLM call.
 * On success the element is tagged so actions can address it via RESOLVED_SELECTOR.
 */
export async function resolveTarget(
  session: BrowserSession,
  target: Target,
): Promise<ResolveResult> {
  return session.evaluate<ResolveResult>(PAGE_RESOLVE_FN, target);
}

/** Resolve with retries — dynamic pages often attach elements late. */
export async function resolveTargetWithRetry(
  session: BrowserSession,
  target: Target,
  timeoutMs = 10_000,
): Promise<ResolveResult> {
  const deadline = Date.now() + timeoutMs;
  let last: ResolveResult = { found: false };
  while (Date.now() < deadline) {
    last = await resolveTarget(session, target);
    if (last.found) return last;
    await session.waitMs(400);
  }
  return last;
}
