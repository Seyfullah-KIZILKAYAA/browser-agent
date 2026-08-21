import { describe, expect, it } from "vitest";
import { extractJson } from "../src/agent/json";

describe("model JSON extraction", () => {
  it("parses a bare object", () => {
    expect(extractJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips fences and prose", () => {
    const text = 'Here you go:\n```json\n{"done": true, "note": "ok"}\n```';
    expect(extractJson<{ done: boolean }>(text).done).toBe(true);
  });

  it("throws on no JSON", () => {
    expect(() => extractJson("sorry, I cannot")).toThrow();
  });
});
