import { describe, expect, it } from "vitest";
import { sanitizeHeaderValue } from "../src/llm/provider";

describe("header value sanitization", () => {
  it("trims whitespace and zero-width chars", () => {
    expect(sanitizeHeaderValue("  gsk_abc123  ", "key")).toBe("gsk_abc123");
    expect(sanitizeHeaderValue("gsk_​abc", "key")).toBe("gsk_abc"); // zero-width space
  });

  it("throws a clear error on a non-Latin-1 character", () => {
    // A Turkish 'ı' sneaked into a key crashes fetch cryptically; we catch it.
    expect(() => sanitizeHeaderValue("gsk_abcı123", "API anahtarı")).toThrow(/geçersiz bir karakter/);
  });

  it("accepts a normal ASCII key", () => {
    const key = "gsk_1234567890ABCDEFxyz";
    expect(sanitizeHeaderValue(key, "key")).toBe(key);
  });
});
