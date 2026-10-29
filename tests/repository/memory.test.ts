import { describe, it, expect, beforeAll } from "vitest";
import { MemoryRepository } from "../../src/repository/memory.js";
import { loadSnapshot, loadEmails } from "../../src/data/load.js";

let repo: MemoryRepository;

beforeAll(() => {
  repo = new MemoryRepository(loadSnapshot(), loadEmails(), "2026-11-02");
});

describe("MemoryRepository release path", () => {
  it("releases a draft, allocating stock and consuming credit", () => {
    const item = repo.getEmail("E001")!;
    const draft = item.drafts[0];
    const inv = repo.getSnapshot().inventory.find((i) => i.sku === "HPS-1408")!;
    const customer = repo.getSnapshot().customers.find((c) => c.customerId === draft.customerId)!;
    const allocatedBefore = inv.allocated;
    const balanceBefore = customer.openBalance;

    const res = repo.release("E001", draft.soNumber);
    expect(res.ok).toBe(true);
    expect(draft.status).toBe("RELEASED");
    expect(draft.releasedAt).toBeTruthy();
    expect(inv.allocated - allocatedBefore).toBe(draft.lines.find((l) => l.sku === "HPS-1408")!.quantity);
    expect(customer.openBalance - balanceBefore).toBeCloseTo(draft.orderTotal);

    const audit = repo.listAudit({ emailId: "E001", actor: "human" });
    expect(audit.some((a) => a.action === "released")).toBe(true);
  });

  it("refuses to release the same draft twice", () => {
    const item = repo.getEmail("E001")!;
    const draft = item.drafts[0];
    const res = repo.release("E001", draft.soNumber);
    expect(res.ok).toBe(false);
    expect(res.reasons[0]).toContain("already");
  });

  it("records an auditable rejection with a reason", () => {
    const res = repo.reject("E002", repo.getEmail("E002")!.drafts[0].soNumber, "customer called to cancel");
    expect(res.ok).toBe(true);
    const audit = repo.listAudit({ emailId: "E002", actor: "human" });
    expect(audit.some((a) => a.action === "rejected" && a.detail.includes("customer called to cancel"))).toBe(true);
  });

  it("bulk-releases selected drafts, each with its own audit rows", () => {
    const before = repo.listAudit({ emailId: "E003", actor: "human" }).length;
    const res = repo.bulkRelease(["E003"]);
    expect(res[0].result.ok).toBe(true);
    const after = repo.listAudit({ emailId: "E003", actor: "human" }).length;
    expect(after).toBeGreaterThan(before);
  });
});
