import { describe, expect, it } from "vitest";
import { DEFAULT_HUMAN, FAST_ROBOT, Rng, typingPlan } from "../src/human/behavior";

describe("human behavior", () => {
  it("is deterministic for a given seed", () => {
    const a = new Rng(7);
    const b = new Rng(7);
    expect(a.int(0, 1000)).toBe(b.int(0, 1000));
  });

  it("produces per-character typing delays when enabled", () => {
    const plan = typingPlan("ab c", DEFAULT_HUMAN, new Rng(1));
    expect(plan).toHaveLength(4);
    expect(plan.every((p) => p.delayMs > 0)).toBe(true);
  });

  it("produces zero delays in fast-robot mode", () => {
    const plan = typingPlan("abc", FAST_ROBOT, new Rng(1));
    expect(plan.every((p) => p.delayMs === 0)).toBe(true);
  });
});
