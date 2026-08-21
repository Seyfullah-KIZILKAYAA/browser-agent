import { describe, expect, it } from "vitest";
import { WorkflowRecorder } from "../src/agent/recorder";

describe("workflow recorder", () => {
  it("builds a replayable workflow and parameterizes sample values", () => {
    const rec = new WorkflowRecorder({
      name: "t",
      allowedDomains: ["example.com"],
      inputs: [{ name: "sku", type: "string", source: "column:SKU", required: true }],
    });
    rec.add({ action: { type: "navigate", value: "https://example.com/urun/ABC123" }, target: null, note: "aç", risk: "read" });
    rec.add({
      action: { type: "type", index: 1, value: "ABC123" },
      target: { role: "textbox", name: "SKU", testId: null, css: "#sku", xpath: null, text: null, nth: 0, anchor: null },
      note: "sku gir",
      risk: "write",
    });
    rec.parameterize({ ABC123: "sku" });
    const wf = rec.build("heal");

    expect(wf.steps).toHaveLength(2);
    expect(wf.steps[0]!.url).toBe("https://example.com/urun/{{sku}}");
    expect(wf.steps[1]!.value).toBe("{{sku}}");
    expect(wf.targets["@t1"]!.name).toBe("SKU");
    expect(wf.createdBy).toBe("recorder");
  });
});
