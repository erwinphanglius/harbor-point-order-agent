import { describe, it, expect } from "vitest";
import { matchProduct, resolveSku, translateToEnglish } from "../../src/core/product-matching.js";
import type { Product } from "../../src/core/types.js";

const products: Product[] = [
  { sku: "HPS-1001", name: "Nitrile Gloves, Blue, Medium", category: "Gloves", sellUom: "CS", pack: "", listPrice: 68, status: "ACTIVE", replacedBy: null },
  { sku: "HPS-1002", name: "Nitrile Gloves, Blue, Large", category: "Gloves", sellUom: "CS", pack: "", listPrice: 68, status: "ACTIVE", replacedBy: null },
  { sku: "HPS-1003", name: "Nitrile Gloves, Blue, Small", category: "Gloves", sellUom: "CS", pack: "", listPrice: 68, status: "ACTIVE", replacedBy: null },
  { sku: "HPS-1004", name: "Vinyl Gloves, Clear, Medium", category: "Gloves", sellUom: "CS", pack: "", listPrice: 45, status: "DISCONTINUED", replacedBy: "HPS-1001" },
  { sku: "HPS-1103", name: "Toilet Tissue, 2-ply, Standard Roll", category: "Paper", sellUom: "CS", pack: "", listPrice: 72, status: "ACTIVE", replacedBy: null },
  { sku: "HPS-1104", name: "Jumbo Toilet Tissue, 9in Roll", category: "Paper", sellUom: "CS", pack: "", listPrice: 55, status: "ACTIVE", replacedBy: null },
  { sku: "HPS-1201", name: "Trash Liners, 33 gal, Black", category: "Liners", sellUom: "CS", pack: "", listPrice: 39, status: "ACTIVE", replacedBy: null },
  { sku: "HPS-1202", name: "Trash Liners, 55 gal, Black", category: "Liners", sellUom: "CS", pack: "", listPrice: 44, status: "ACTIVE", replacedBy: null },
  { sku: "HPS-1203", name: "Trash Liners, 13 gal, White", category: "Liners", sellUom: "CS", pack: "", listPrice: 36, status: "ACTIVE", replacedBy: null },
  { sku: "HPS-1306", name: "Neutral Floor Cleaner, 1 gal", category: "Chemicals", sellUom: "CS", pack: "", listPrice: 47, status: "DISCONTINUED", replacedBy: "HPS-1307" },
  { sku: "HPS-1307", name: "Neutral Floor Cleaner, 2.5 L", category: "Chemicals", sellUom: "CS", pack: "", listPrice: 51, status: "ACTIVE", replacedBy: null },
  { sku: "HPS-1402", name: "Paper Soup Cup with Lid, 16 oz", category: "Takeout", sellUom: "CS", pack: "", listPrice: 71, status: "ACTIVE", replacedBy: null },
  { sku: "HPS-1403", name: "Paper Hot Cup, 12 oz", category: "Takeout", sellUom: "CS", pack: "", listPrice: 78, status: "ACTIVE", replacedBy: null },
  { sku: "HPS-1404", name: "Hot Cup Lid, fits 12-16 oz", category: "Takeout", sellUom: "CS", pack: "", listPrice: 46, status: "ACTIVE", replacedBy: null },
];

describe("product matching", () => {
  it("distinguishes soup cups (with lids) from standalone lids", () => {
    expect(matchProduct("16 oz soup cups with lids", products)).toMatchObject({ status: "matched", sku: "HPS-1402" });
    expect(matchProduct("Lids for the hot cups", products)).toMatchObject({ status: "matched", sku: "HPS-1404" });
  });

  it("matches 'big toilet paper rolls' and flags bare 'gloves' as ambiguous", () => {
    expect(matchProduct("big toilet paper rolls", products)).toMatchObject({ status: "matched", sku: "HPS-1104" });
    expect(matchProduct("gloves", products).status).toBe("ambiguous");
  });

  it("disambiguates 33 gal vs 55 gal liners", () => {
    expect(matchProduct("33 gal black bags", products)).toMatchObject({ status: "matched", sku: "HPS-1201" });
    expect(matchProduct("55 gal black bags", products)).toMatchObject({ status: "matched", sku: "HPS-1202" });
  });

  it("resolves discontinued SKUs to replacements and reports unknown SKUs", () => {
    const r = resolveSku("HPS-1004", products);
    expect(r.status).toBe("discontinued");
    if (r.status === "discontinued") expect(r.replacement?.sku).toBe("HPS-1001");
    expect(resolveSku("HPS-9999", products).status).toBe("unknown");
  });

  it("translates Spanish order terms", () => {
    const desc = translateToEnglish("4 cajas de guantes de nitrilo talla L");
    expect(desc).toContain("gloves");
    expect(desc).toContain("nitrile");
    expect(desc).toContain("large");
  });
});
