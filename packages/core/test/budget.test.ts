import { describe, expect, it } from "vitest";
import { BudgetGuard } from "../src/llm/budget";

describe("budget guard + cost accounting", () => {
  it("tracks tokens, USD, and per-phase breakdown", () => {
    const b = new BudgetGuard(1_000_000);
    b.record({ inputTokens: 1000, outputTokens: 200, model: "claude-sonnet-5" }, "navigator");
    b.record({ inputTokens: 500, outputTokens: 100, model: "claude-opus-5" }, "healer");
    const s = b.summary();
    expect(s.total).toBe(1800);
    expect(s.usd).toBeGreaterThan(0);
    expect(s.phases.navigator!.calls).toBe(1);
    expect(s.phases.healer!.calls).toBe(1);
  });

  it("counts cache reads toward billable tokens and hit rate", () => {
    const b = new BudgetGuard(1_000_000);
    b.record({ inputTokens: 100, outputTokens: 50, cacheReadTokens: 900, model: "claude-sonnet-5" });
    expect(b.total).toBe(1050);
    expect(b.cacheHitRate).toBeCloseTo(0.9, 2);
  });

  it("throws on token ceiling", () => {
    const b = new BudgetGuard(100);
    expect(() => b.record({ inputTokens: 200, outputTokens: 0 })).toThrow(/budget exceeded/);
  });

  it("throws on USD ceiling", () => {
    const b = new BudgetGuard(10_000_000, 0.001);
    expect(() =>
      b.record({ inputTokens: 1_000_000, outputTokens: 0, model: "claude-opus-5" }),
    ).toThrow(/USD budget/);
  });
});
