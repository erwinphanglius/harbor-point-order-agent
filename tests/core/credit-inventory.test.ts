import { describe, it, expect } from "vitest";
import { checkCredit } from "../../src/core/credit.js";
import { checkStock } from "../../src/core/inventory.js";
import type { Customer, Inventory, IncomingSupply } from "../../src/core/types.js";

const active: Customer = { customerId: "C001", name: "Bluefin", paymentTerms: "NET30", creditLimit: 20000, openBalance: 4200, status: "ACTIVE" };
const onHold: Customer = { customerId: "C009", name: "Coastal", paymentTerms: "NET30", creditLimit: 7000, openBalance: 6800, status: "CREDIT_HOLD" };

describe("credit", () => {
  it("blocks a customer on credit hold", () => {
    expect(checkCredit(onHold, 100)).toMatchObject({ ok: false, reason: "CREDIT_HOLD" });
  });

  it("blocks when open balance plus order exceeds the limit", () => {
    const r = checkCredit({ ...active, openBalance: 7900, creditLimit: 8000 }, 200);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("CREDIT_LIMIT_EXCEEDED");
  });
});

describe("inventory", () => {
  const inventory: Inventory[] = [{ sku: "HPS-1405", onHand: 0, allocated: 0, available: 0 }];
  const incoming: IncomingSupply[] = [{ supplierPo: "PO-7710", sku: "HPS-1405", qty: 100, expectedDate: "2026-11-13" }];

  it("passes when stock covers the order and reports shortfall with next arrival", () => {
    expect(checkStock("HPS-1405", 0, inventory, incoming).ok).toBe(true);
    const r = checkStock("HPS-1405", 15, inventory, incoming);
    expect(r.ok).toBe(false);
    expect(r.shortfall).toBe(15);
    expect(r.nextArrival).toBe("2026-11-13");
  });
});
