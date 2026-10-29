import { describe, it, expect } from "vitest";
import { resolveUnitPrice, hasExpiredContract, checkPriceClaims } from "../../src/core/pricing.js";
import type { CustomerPrice, Product } from "../../src/core/types.js";

const product: Product = {
  sku: "HPS-1403",
  name: "Paper Hot Cup, 12 oz",
  category: "Takeout",
  sellUom: "CS",
  pack: "1000 cups",
  listPrice: 78,
  status: "ACTIVE",
  replacedBy: null,
};
const products = [product];

const validContract: CustomerPrice = { customerId: "C002", sku: "HPS-1403", unitPrice: 70, validFrom: "2026-09-01", validTo: "2026-12-31" };
const expiredContract: CustomerPrice = { customerId: "C002", sku: "HPS-1403", unitPrice: 70, validFrom: "2026-04-01", validTo: "2026-09-30" };

describe("pricing", () => {
  it("applies a valid contract price over the list price", () => {
    const r = resolveUnitPrice("HPS-1403", "C002", "2026-11-02", [validContract], products);
    expect(r).toEqual({ unitPrice: 70, source: "contract" });
  });

  it("falls back to list price when the contract has expired", () => {
    const r = resolveUnitPrice("HPS-1403", "C002", "2026-11-02", [expiredContract], products);
    expect(r).toEqual({ unitPrice: 78, source: "list" });
    expect(hasExpiredContract("HPS-1403", "C002", "2026-11-02", [expiredContract])).toBe(true);
  });

  it("flags an expired-contract price claim (E024 pattern)", () => {
    const body = "Please send 4 cases of 12 oz hot cups at our contract price of $70/case";
    const issues = checkPriceClaims(body, "C002", "2026-11-02", [expiredContract], products);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("EXPIRED_CONTRACT_PRICE");
  });

  it("flags a price claim with no record (E025 pattern)", () => {
    const body = "please book 6 cases of paper straws at $30 a case";
    const straws: Product = { ...product, sku: "HPS-1406", name: "Wrapped Paper Straws", listPrice: 34 };
    const issues = checkPriceClaims(body, "C010", "2026-11-02", [], [straws]);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("NO_RECORD_PRICE_CLAIM");
  });
});
