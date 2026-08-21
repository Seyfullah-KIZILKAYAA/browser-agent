import { describe, expect, it } from "vitest";
import { SiteProfileCache } from "../src/memory/site-profile";
import { Target } from "@ba/shared";

const target: Target = {
  role: "button", name: "Sepete Ekle", testId: null, css: "#add", xpath: null, text: "Sepete Ekle", nth: 0, anchor: null,
};

describe("site profile cache", () => {
  it("remembers and looks up a locator by domain + intent", async () => {
    const c = new SiteProfileCache();
    await c.remember("https://shop.example.com/p/1", "sepete ekle butonuna tıkla", target);
    const hit = await c.lookup("https://shop.example.com/p/2", "sepete ekle butonuna tıkla");
    expect(hit?.css).toBe("#add");
  });

  it("does not leak across domains", async () => {
    const c = new SiteProfileCache();
    await c.remember("https://a.com/x", "giriş yap", target);
    expect(await c.lookup("https://b.com/x", "giriş yap")).toBeNull();
  });

  it("drops entries that fail more than they help", async () => {
    const c = new SiteProfileCache();
    await c.remember("https://a.com", "ara", target); // hits=1
    await c.penalize("https://a.com", "ara"); // misses=1, kept (1 <= 2)
    await c.penalize("https://a.com", "ara"); // misses=2, kept (2 <= 2)
    expect(await c.lookup("https://a.com", "ara")).not.toBeNull();
    await c.penalize("https://a.com", "ara"); // misses=3 > hits+1 → dropped
    expect(await c.lookup("https://a.com", "ara")).toBeNull();
  });
});
