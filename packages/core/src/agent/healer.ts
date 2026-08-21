import { Step, Target, Workflow } from "@ba/shared";
import { BrowserSession } from "../transport/session";
import { renderSnapshot, takeSnapshot } from "../perception/snapshot";
import { PAGE_CAPTURE_FN } from "../perception/page-script";
import { LLMProvider } from "../llm/provider";
import { BudgetGuard } from "../llm/budget";
import { extractJson } from "./json";
import { HEALER_SYSTEM, wrapUntrusted } from "./prompts";

/**
 * HEAL mode: when a step's locator breaks, send only that step's local context
 * to the model, pick the matching element on the current page, capture a fresh
 * multi-layer locator and patch the workflow in place (≤5k tokens per heal).
 */
export function makeHealer(provider: LLMProvider, budget: BudgetGuard, session: BrowserSession) {
  return async (workflow: Workflow, step: Step, error: Error): Promise<boolean> => {
    if (!step.target) return false;
    const oldTarget = workflow.targets[step.target];
    const snap = await takeSnapshot(session, { maxElements: 100 });

    const prompt = [
      `Step intent: ${step.note ?? `${step.action} on ${step.target}`}`,
      `Action: ${step.action}`,
      `Old target: role=${oldTarget?.role ?? "?"} name="${oldTarget?.name ?? "?"}"`,
      `Error: ${error.message}`,
      "",
      "Current page elements:",
      wrapUntrusted(renderSnapshot(snap)),
    ].join("\n");

    const res = await provider.complete({
      system: HEALER_SYSTEM,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 200,
    });
    budget.record(res.usage, "healer");

    const { index } = extractJson<{ index: number | null }>(res.text);
    if (index === null || index === undefined) return false;

    const fresh = await session.evaluate<Target | null>(PAGE_CAPTURE_FN, index);
    if (!fresh) return false;
    workflow.targets[step.target] = fresh;
    workflow.version += 1;
    return true;
  };
}
