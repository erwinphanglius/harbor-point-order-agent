import { describe, it, expect, beforeAll } from "vitest";
import { MemoryRepository } from "../../src/repository/memory.js";
import { loadSnapshot, loadEmails } from "../../src/data/load.js";

let repo: MemoryRepository;

beforeAll(() => {
  repo = new MemoryRepository(loadSnapshot(), loadEmails(), "2026-11-02");
});

describe("MemoryRepository release path", () => {
  it("releases a draft, allocating stock and consuming credit", async () => {
    const item = (await repo.getEmail("E001"))!;
    const draft = item.drafts[0];
    const snapshot = await repo.getSnapshot();
    const inv = snapshot.inventory.find((i) => i.sku === "HPS-1408")!;
    const customer = snapshot.customers.find((c) => c.customerId === draft.customerId)!;
    const allocatedBefore = inv.allocated;
    const balanceBefore = customer.openBalance;

    const res = await repo.release("E001", draft.soNumber);
    expect(res.ok).toBe(true);
    expect(draft.status).toBe("RELEASED");
    expect(draft.releasedAt).toBeTruthy();
    expect(inv.allocated - allocatedBefore).toBe(draft.lines.find((l) => l.sku === "HPS-1408")!.quantity);
    expect(customer.openBalance - balanceBefore).toBeCloseTo(draft.orderTotal);

    const audit = await repo.listAudit({ emailId: "E001", actor: "human" });
    expect(audit.some((a) => a.action === "released")).toBe(true);
  });

  it("refuses to release the same draft twice", async () => {
    const item = (await repo.getEmail("E001"))!;
    const draft = item.drafts[0];
    const res = await repo.release("E001", draft.soNumber);
    expect(res.ok).toBe(false);
    expect(res.reasons[0]).toContain("already");
  });

  it("records an auditable rejection with a reason", async () => {
    const draft = (await repo.getEmail("E002"))!.drafts[0];
    const res = await repo.reject("E002", draft.soNumber, "customer called to cancel");
    expect(res.ok).toBe(true);
    const audit = await repo.listAudit({ emailId: "E002", actor: "human" });
    expect(audit.some((a) => a.action === "rejected" && a.detail.includes("customer called to cancel"))).toBe(true);
  });

  it("bulk-releases selected drafts, each with its own audit rows", async () => {
    const before = (await repo.listAudit({ emailId: "E003", actor: "human" })).length;
    const res = await repo.bulkRelease(["E003"]);
    expect(res[0].result.ok).toBe(true);
    const after = (await repo.listAudit({ emailId: "E003", actor: "human" })).length;
    expect(after).toBeGreaterThan(before);
  });

  it("closes an email with a typed reason and keeps it as the recorded decision", async () => {
    const res = await repo.reject("E027", null, "no action needed");
    expect(res.ok).toBe(true);
    const item = (await repo.getEmail("E027"))!;
    expect(item.emailState).toBe("no_action");
    expect(item.emailRejectReason).toBe("no action needed");
    const audit = await repo.listAudit({ emailId: "E027", actor: "human" });
    expect(audit.some((a) => a.action === "rejected" && a.detail.includes("no action needed"))).toBe(true);
  });

  it("restores an auto-ignored email so a human can look at it again", async () => {
    const ignored = (await repo.listInbox()).find((i) => i.result.disposition === "IGNORE");
    expect(ignored).toBeTruthy();
    const res = await repo.restore(ignored!.email.emailId);
    expect(res.ok).toBe(true);
    const item = (await repo.getEmail(ignored!.email.emailId))!;
    expect(item.reviewStatus).toBe("pending");
    expect(item.result.disposition).toBe("ESCALATE");
    const audit = await repo.listAudit({ emailId: ignored!.email.emailId, actor: "human" });
    expect(audit.some((a) => a.action === "restored")).toBe(true);
  });

  it("approving a proposed change reads as an approval, not a cancellation", async () => {
    const item = (await repo.getEmail("E004"))!;
    const soNumber = item.result.changeProposal!.soNumber;
    const res = await repo.approveChange("E004");
    expect(res.ok).toBe(true);
    expect(res.detail).toContain(`Change approved on ${soNumber}`);
    expect(res.detail).not.toMatch(/cancelled|back to stock|credit released/i);
    expect(item.reviewStatus).toBe("approved");
  });

  it("releases a draft that a person approved without changing anything", async () => {
    const candidate = (await repo.listInbox()).find((i) => i.drafts.some((d) => d.status === "DRAFT"))!;
    const emailId = candidate.email.emailId;
    const draft = candidate.drafts.find((d) => d.status === "DRAFT")!;
    const res = await repo.releaseWithEdits(emailId, draft.soNumber, {
      lines: draft.lines.map((l) => ({ sku: l.sku, quantity: l.quantity })),
      shipToId: draft.shipToId,
      requestedDate: draft.requestedDate,
    });
    expect(res.ok).toBe(true);
    const after = (await repo.getEmail(emailId))!;
    expect(after.drafts.find((d) => d.soNumber === draft.soNumber)!.status).toBe("RELEASED");
    expect(after.drafts.find((d) => d.soNumber === draft.soNumber)!.releasedAt).toBeTruthy();
  });
});
