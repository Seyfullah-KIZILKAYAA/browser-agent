import { describe, expect, it } from "vitest";
import { isDomainAllowed } from "../src/security/allowlist";

describe("domain allowlist", () => {
  it("allows exact domain and subdomains", () => {
    expect(isDomainAllowed("https://example.com/x", ["example.com"])).toBe(true);
    expect(isDomainAllowed("https://panel.example.com/", ["example.com"])).toBe(true);
  });

  it("blocks other domains and lookalikes", () => {
    expect(isDomainAllowed("https://evil.com", ["example.com"])).toBe(false);
    expect(isDomainAllowed("https://notexample.com", ["example.com"])).toBe(false);
  });

  it("blocks file:// unless explicitly allowed", () => {
    expect(isDomainAllowed("file:///C:/x.html", ["example.com"])).toBe(false);
    expect(isDomainAllowed("file:///C:/x.html", ["file"])).toBe(true);
  });

  it("'*' allows any web page but not browser-internal pages", () => {
    expect(isDomainAllowed("https://anything.com/x", ["*"])).toBe(true);
    expect(isDomainAllowed("https://github.com", ["*"])).toBe(true);
    expect(isDomainAllowed("chrome://extensions", ["*"])).toBe(false);
    expect(isDomainAllowed("chrome-extension://abc/page.html", ["*"])).toBe(false);
  });
});
