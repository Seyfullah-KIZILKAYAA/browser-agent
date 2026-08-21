import { describe, expect, it } from "vitest";
import { containsSecret, referencedVars, substitute } from "../src/util/template";

describe("template substitution", () => {
  it("replaces variables", () => {
    expect(substitute("fiyat: {{fiyat}} TL", { vars: { fiyat: 99 } })).toBe("fiyat: 99 TL");
  });

  it("throws on missing variable", () => {
    expect(() => substitute("{{yok}}", { vars: {} })).toThrow(/yok/);
  });

  it("resolves secrets only via resolver", () => {
    const out = substitute("pw={{secret:panel_pw}}", {
      vars: {},
      resolveSecret: (n) => (n === "panel_pw" ? "s3cret" : undefined),
    });
    expect(out).toBe("pw=s3cret");
  });

  it("detects secret placeholders for redaction", () => {
    expect(containsSecret("{{secret:x}}")).toBe(true);
    expect(containsSecret("{{fiyat}}")).toBe(false);
  });

  it("lists referenced vars without secrets", () => {
    expect(referencedVars("{{a}} {{secret:b}} {{c}}")).toEqual(["a", "c"]);
  });
});
