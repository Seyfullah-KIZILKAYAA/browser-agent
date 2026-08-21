import { BrowserSession } from "../transport/session";
import { LLMProvider } from "../llm/provider";
import { BudgetGuard } from "../llm/budget";
import { takeSnapshot } from "./snapshot";
import { PAGE_CLEAR_SOM_FN, PAGE_DRAW_SOM_FN } from "./som-script";
import { extractJson } from "../agent/json";

const VISION_SYSTEM = `You see a screenshot of a web page with numbered colored boxes drawn over its interactive elements. Each number is an element id.

The DOM-based reader could not confidently find the element for the user's goal. Look at the screenshot and choose the numbered box that best matches the goal.

Respond with ONLY: {"index": <the number of the matching box, or null if none matches>, "reason": "<short>"}`;

export interface VisionResult {
  index: number | null;
  reason: string;
}

/**
 * Perception ladder K4: when DOM/locator confidence is low, draw Set-of-Marks
 * boxes, screenshot the viewport, and ask the vision model for the matching
 * NUMBER (not coordinates). Falls back cheaply and only on demand.
 */
export async function visionPickElement(
  session: BrowserSession,
  provider: LLMProvider,
  budget: BudgetGuard,
  goal: string,
): Promise<VisionResult> {
  // Ensure elements are tagged (snapshot assigns data-ba-i), then draw boxes.
  await takeSnapshot(session);
  await session.evaluate(PAGE_DRAW_SOM_FN);
  const image = await session.screenshotBase64(false);
  await session.evaluate(PAGE_CLEAR_SOM_FN);

  const res = await provider.complete({
    system: VISION_SYSTEM,
    messages: [{ role: "user", content: `Goal: ${goal}`, imageBase64: image }],
    maxTokens: 150,
  });
  budget.record(res.usage, "vision");
  return extractJson<VisionResult>(res.text);
}
