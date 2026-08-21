import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { parseWorkflow } from "@ba/shared";
import { mapRowToVars, parseDataFile } from "../src/data/parse";

const wf = parseWorkflow({
  name: "t",
  allowedDomains: ["example.com"],
  inputs: [
    { name: "sku", type: "string", source: "column:SKU", required: true },
    { name: "fiyat", type: "string", source: "column:Fiyat", required: true },
  ],
  steps: [{ id: "s1", action: "navigate", url: "https://example.com" }],
});

describe("data parsing and mapping", () => {
  it("parses csv with headers", () => {
    const p = path.join(os.tmpdir(), "ba-test.csv");
    fs.writeFileSync(p, "SKU,Fiyat\nA1,10\nA2,20\n", "utf8");
    const rows = parseDataFile(p);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ SKU: "A1", Fiyat: "10" });
  });

  it("maps columns to workflow inputs", () => {
    expect(mapRowToVars(wf, { SKU: "A1", Fiyat: "10" })).toEqual({ sku: "A1", fiyat: "10" });
  });

  it("throws on missing required column", () => {
    expect(() => mapRowToVars(wf, { SKU: "A1" })).toThrow(/Fiyat/);
  });
});
