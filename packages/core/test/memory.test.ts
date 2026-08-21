import { describe, expect, it } from "vitest";
import { AgentMemory } from "../src/agent/memory";

describe("agent memory compaction", () => {
  it("keeps recent raw steps and folds older ones into a summary", () => {
    const mem = new AgentMemory(2);
    for (let i = 1; i <= 5; i++) {
      mem.add({ n: i, thought: `t${i}`, action: `click ${i}`, outcome: `ok${i}` });
    }
    const rendered = mem.render();
    // Oldest steps are summarized, not shown raw.
    expect(rendered).toContain("Earlier steps");
    expect(rendered).toContain("1. click 1 → ok1");
    // Only the last 2 appear in full "thought/action/outcome" form.
    expect(rendered).toContain("thought: t5");
    expect(rendered).toContain("thought: t4");
    expect(rendered).not.toContain("thought: t3");
  });
});
