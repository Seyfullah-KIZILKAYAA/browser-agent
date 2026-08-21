import { describe, expect, it } from "vitest";
import { parseWorkflow } from "../src/schema/workflow";

const valid = {
  version: 1,
  name: "test",
  allowedDomains: ["example.com"],
  inputs: [{ name: "sku", type: "string", source: "column:SKU", required: true }],
  steps: [
    { id: "s1", action: "navigate", url: "https://example.com/{{sku}}" },
    { id: "s2", action: "type", target: "@t1", value: "{{sku}}", risk: "write" },
  ],
  targets: {
    "@t1": { role: "textbox", name: "SKU" },
  },
  onFailure: "heal",
};

describe("workflow schema", () => {
  it("parses a valid workflow and applies defaults", () => {
    const wf = parseWorkflow(valid);
    expect(wf.budget.maxTokens).toBe(200_000);
    expect(wf.targets["@t1"]!.nth).toBe(0);
    expect(wf.steps[0]!.risk).toBe("read");
  });

  it("rejects unknown actions", () => {
    const bad = { ...valid, steps: [{ id: "s1", action: "explode" }] };
    expect(() => parseWorkflow(bad)).toThrow();
  });

  it("rejects empty allowedDomains", () => {
    const bad = { ...valid, allowedDomains: [] };
    expect(() => parseWorkflow(bad)).toThrow();
  });
});
