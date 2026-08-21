import { describe, expect, it } from "vitest";
import { rankElements } from "../src/perception/rank";
import { SnapshotElement } from "../src/perception/snapshot";

function el(i: number, role: string, name: string): SnapshotElement {
  return { i, role, name, states: [] };
}

describe("BM25 element ranking (K3)", () => {
  const many: SnapshotElement[] = [
    el(1, "link", "Ana Sayfa"),
    el(2, "textbox", "Ürün arama"),
    el(3, "button", "Sepete Ekle"),
    el(4, "link", "İletişim"),
    el(5, "button", "Fiyat filtrele"),
    el(6, "link", "Hakkımızda"),
    el(7, "textbox", "E-posta bülteni"),
    el(8, "button", "Giriş Yap"),
  ];

  it("returns everything when under topK", () => {
    const r = rankElements(many, "fiyat", 20);
    expect(r.heldBack).toBe(0);
    expect(r.elements).toHaveLength(8);
  });

  it("surfaces query-relevant elements and holds back the rest", () => {
    const r = rankElements(many, "fiyat filtrele sepet", 3);
    expect(r.elements.length).toBe(3);
    expect(r.heldBack).toBe(5);
    const names = r.elements.map((e) => e.name);
    expect(names).toContain("Fiyat filtrele");
    expect(names).toContain("Sepete Ekle");
  });

  it("preserves original DOM order within the selected subset", () => {
    const r = rankElements(many, "sepet fiyat", 2);
    const indices = r.elements.map((e) => e.i);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });
});
