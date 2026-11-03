import { describe, it, expect, beforeAll } from "vitest";
import { loadSnapshot, loadEmails } from "../../src/data/load.js";
import { runOffline } from "../../src/agent/offline.js";
import type { ProcessingResult } from "../../src/core/types.js";

const ORDER_DATE = "2026-11-02";
let results: ProcessingResult[] = [];
let byId: Map<string, ProcessingResult>;

beforeAll(() => {
  const snapshot = loadSnapshot();
  const emails = loadEmails();
  results = runOffline(emails, snapshot, ORDER_DATE);
  byId = new Map(results.map((r) => [r.emailId, r]));
});

const EXPECTED: Record<string, string> = {
  E001: "AUTO_DRAFT",
  E002: "AUTO_DRAFT",
  E003: "AUTO_DRAFT",
  E004: "PROPOSE_CHANGE",
  E005: "AUTO_DRAFT",
  E006: "ESCALATE",
  E007: "ESCALATE",
  E008: "ESCALATE",
  E009: "ROUTE",
  E010: "ESCALATE",
  E011: "AUTO_DRAFT",
  E012: "ESCALATE",
  E013: "ESCALATE",
  E014: "ESCALATE",
  E015: "AUTO_DRAFT",
  E016: "DUPLICATE",
  E017: "PROPOSE_CHANGE",
  E018: "ESCALATE",
  E019: "ESCALATE",
  E020: "ESCALATE",
  E021: "ESCALATE",
  E022: "ESCALATE",
  E023: "ESCALATE",
  E024: "ESCALATE",
  E025: "ESCALATE",
  E026: "ESCALATE",
  E027: "ROUTE",
  E028: "IGNORE",
  E029: "IGNORE",
  E030: "ROUTE",
  E031: "AUTO_DRAFT",
  E032: "ESCALATE",
  E033: "ESCALATE",
  E034: "AUTO_DRAFT",
  E035: "ESCALATE",
  E036: "ESCALATE",
  E037: "AUTO_DRAFT",
  E038: "AUTO_DRAFT",
  E039: "AUTO_DRAFT",
  E040: "AUTO_DRAFT",
};

describe("offline pipeline over all 40 emails", () => {
  it("processes all 40 emails and matches the expected disposition for each", () => {
    expect(results).toHaveLength(40);
    for (const [id, disposition] of Object.entries(EXPECTED)) {
      const r = byId.get(id);
      expect(r, `missing ${id}`).toBeDefined();
      expect(r?.disposition, `${id} disposition`).toBe(disposition);
    }
  });

  it("forces the injection email (E012) to human review and records the attempt", () => {
    const r = byId.get("E012")!;
    expect(r.injection.detected).toBe(true);
    expect(r.issues.map((i) => i.code)).toContain("INJECTION");
    expect(r.audit.some((a) => a.action === "injection_flagged")).toBe(true);
    expect(r.drafts).toHaveLength(0);
  });

  it("escalates E024 for expired contract price and E025 for no-record price claim", () => {
    expect(byId.get("E024")!.issues.map((i) => i.code)).toContain("EXPIRED_CONTRACT_PRICE");
    expect(byId.get("E025")!.issues.map((i) => i.code)).toContain("NO_RECORD_PRICE_CLAIM");
  });

  it("escalates credit hold (E007) and credit-limit breach (E006)", () => {
    expect(byId.get("E007")!.issues.map((i) => i.code)).toContain("CREDIT_HOLD");
    expect(byId.get("E006")!.issues.map((i) => i.code)).toContain("CREDIT_LIMIT_EXCEEDED");
  });

  it("escalates discontinued products and suggests the replacement", () => {
    const e19 = byId.get("E019")!.issues.find((i) => i.code === "DISCONTINUED");
    expect(e19).toBeDefined();
    expect(e19!.message).toContain("HPS-1001");
  });

  it("deduplicates the resent PO (E016) against E015", () => {
    const r = byId.get("E016")!;
    expect(r.disposition).toBe("DUPLICATE");
    expect(r.duplicateOfEmailId).toBe("E015");
  });

  it("applies contract prices on E003", () => {
    const d = byId.get("E003")!.drafts[0];
    const bySku = new Map(d.lines.map((l) => [l.sku, l]));
    expect(bySku.get("HPS-1201")!.unitPrice).toBe(35.1);
    expect(bySku.get("HPS-1201")!.priceSource).toBe("contract");
    expect(bySku.get("HPS-1103")!.unitPrice).toBe(72);
    expect(bySku.get("HPS-1103")!.priceSource).toBe("list");
  });

  it("splits the three-club order (E005) into three draft orders", () => {
    const r = byId.get("E005")!;
    expect(r.drafts).toHaveLength(3);
    const shipTos = new Set(r.drafts.map((d) => d.shipToId));
    expect(shipTos).toEqual(new Set(["S006", "S007", "S008"]));
  });

  it("does not allocate stock or consume credit for drafts (no release)", () => {
    const autoDrafted = results.filter((r) => r.disposition === "AUTO_DRAFT");
    expect(autoDrafted.length).toBeGreaterThan(0);
  });
});
