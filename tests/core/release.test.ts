import { describe, it, expect, beforeAll } from "vitest";
import { loadSnapshot, loadEmails } from "../../src/data/load.js";
import { runOffline } from "../../src/agent/offline.js";
import { validateRelease, validateChangeApproval } from "../../src/core/release.js";
import type { DraftOrderProposal, ErpSnapshot } from "../../src/core/types.js";

let snapshot: ErpSnapshot;
let draftsByEmail: Record<string, DraftOrderProposal[]> = {};

beforeAll(() => {
  snapshot = loadSnapshot();
  const emails = loadEmails();
  const results = runOffline(emails, snapshot, "2026-11-02");
  for (const r of results) {
    if (r.drafts.length > 0) draftsByEmail[r.emailId] = r.drafts;
  }
});

function fresh(): ErpSnapshot {
  return structuredClone(snapshot);
}

describe("validateRelease (approval-time re-validation)", () => {
  it("accepts a clean draft when nothing changed", () => {
    const draft = draftsByEmail.E001[0];
    const v = validateRelease(draft, fresh(), "2026-11-02");
    expect(v.ok).toBe(true);
    expect(v.orderValue).toBeGreaterThan(0);
  });

  it("refuses when stock is no longer sufficient", () => {
    const draft = draftsByEmail.E001[0];
    const snap = fresh();
    const inv = snap.inventory.find((i) => i.sku === "HPS-1408")!;
    inv.available = 1;
    const v = validateRelease(draft, snap, "2026-11-02");
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.code === "INSUFFICIENT_STOCK")).toBe(true);
  });

  it("refuses when the credit limit would now be breached", () => {
    const draft = draftsByEmail.E001[0];
    const snap = fresh();
    const customer = snap.customers.find((c) => c.customerId === draft.customerId)!;
    customer.creditLimit = customer.openBalance + 1;
    const v = validateRelease(draft, snap, "2026-11-02");
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.code === "CREDIT_LIMIT_EXCEEDED")).toBe(true);
  });

  it("refuses when a contract price expired after drafting (price changed)", () => {
    const draft = draftsByEmail.E003[0];
    const contractLine = draft.lines.find((l) => l.priceSource === "contract")!;
    expect(contractLine).toBeDefined();
    const snap = fresh();
    const contract = snap.prices.find((p) => p.customerId === draft.customerId && p.sku === contractLine.sku)!;
    contract.validTo = "2026-10-31"; // now expired relative to release date
    const v = validateRelease(draft, snap, "2026-11-02");
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.code === "PRICE_CHANGED")).toBe(true);
  });
});

describe("validateChangeApproval (order-status re-validation)", () => {
  it("rejects a change to a SHIPPED order", () => {
    const v = validateChangeApproval("SO-24053", fresh()); // SHIPPED in the seed
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("SHIPPED");
  });

  it("accepts a change to an OPEN order", () => {
    const v = validateChangeApproval("SO-24051", fresh()); // OPEN in the seed
    expect(v.ok).toBe(true);
  });

  it("rejects a change to an unknown order", () => {
    const v = validateChangeApproval("SO-99999", fresh());
    expect(v.ok).toBe(false);
  });
});
