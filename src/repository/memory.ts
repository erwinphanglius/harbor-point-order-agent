import type { Email, ErpSnapshot, OrderLineProposal, ProcessingResult } from "../core/types.js";
import { runOffline } from "../agent/offline.js";
import { validateRelease, validateChangeApproval } from "../core/release.js";
import { resolveUnitPrice } from "../core/pricing.js";
import type {
  Actor,
  ActionResult,
  AuditRecord,
  DraftState,
  InboxItem,
  ReleaseEdit,
  Repository,
  ShipToOption,
} from "./types.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function maxOrderNumber(snapshot: ErpSnapshot): number {
  let max = 0;
  for (const o of snapshot.orders) {
    const n = parseInt(o.soNumber.replace(/\D/g, ""), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

export class MemoryRepository implements Repository {
  private snapshot: ErpSnapshot;
  private results: ProcessingResult[];
  private items: InboxItem[];
  private byId: Map<string, InboxItem>;
  private audit: AuditRecord[] = [];
  private auditSeq = 0;
  private releaseDate: string;

  constructor(snapshot: ErpSnapshot, emails: Email[], releaseDate = "2026-11-02") {
    this.snapshot = snapshot;
    this.releaseDate = releaseDate;
    this.results = runOffline(emails, this.snapshot, this.releaseDate);
    this.items = this.buildItems(emails);
    this.byId = new Map(this.items.map((i) => [i.email.emailId, i]));
    this.seedAudit();
  }

  private buildItems(emails: Email[]): InboxItem[] {
    const byEmail = new Map(emails.map((e) => [e.emailId, e]));
    let nextSo = maxOrderNumber(this.snapshot) + 1;

    const items: InboxItem[] = [];
    for (const result of this.results) {
      const email = byEmail.get(result.emailId);
      if (!email) continue;
      const drafts: DraftState[] = [];
      let amount = 0;
      for (const d of result.drafts) {
        const draft: DraftState = {
          soNumber: `SO-${nextSo++}`,
          emailId: result.emailId,
          customerId: d.customerId,
          customerName: d.customerName,
          shipToId: d.shipToId,
          customerPo: d.customerPo,
          requestedDate: d.requestedDate,
          lines: d.lines.map((l) => ({ ...l })),
          orderTotal: d.orderTotal,
          status: "DRAFT",
          releasedAt: null,
          rejectReason: null,
        };
        drafts.push(draft);
        amount = round2(amount + d.orderTotal);
      }
      items.push({
        email,
        result,
        drafts,
        amount: drafts.length > 0 ? amount : null,
        emailState: "pending",
        emailRejectReason: null,
      });
    }
    return items;
  }

  private seedAudit(): void {
    for (const item of this.items) {
      for (const entry of item.result.audit) {
        this.appendAudit(item.email.emailId, "agent", entry.action, entry.detail, item.email.receivedAt);
      }
    }
  }

  private appendAudit(emailId: string | null, actor: Actor, action: string, detail: string, timestamp?: string): void {
    this.audit.push({
      id: this.auditSeq++,
      timestamp: timestamp ?? new Date().toISOString(),
      emailId,
      actor,
      action,
      detail,
    });
  }

  async processInbox(): Promise<ProcessingResult[]> {
    return this.results;
  }

  async listInbox(): Promise<InboxItem[]> {
    return [...this.items].sort((a, b) => a.email.receivedAt.localeCompare(b.email.receivedAt));
  }

  async getEmail(emailId: string): Promise<InboxItem | null> {
    return this.byId.get(emailId) ?? null;
  }

  async listAudit(filter?: { emailId?: string; actor?: Actor }): Promise<AuditRecord[]> {
    const list = this.audit
      .filter((a) => (!filter?.emailId || a.emailId === filter.emailId))
      .filter((a) => (!filter?.actor || a.actor === filter.actor));
    return [...list].sort((a, b) => b.id - a.id);
  }

  async listShipTos(customerId: string): Promise<ShipToOption[]> {
    return this.snapshot.shipTos
      .filter((s) => s.customerId === customerId)
      .map((s) => ({ shipToId: s.shipToId, name: s.name, address: s.address, isDefault: s.isDefault }));
  }

  private findDraft(emailId: string, soNumber: string): DraftState | null {
    const item = this.byId.get(emailId);
    if (!item) return null;
    return item.drafts.find((d) => d.soNumber === soNumber) ?? null;
  }

  private applyRelease(item: InboxItem, draft: DraftState, orderValue: number): void {
    draft.status = "RELEASED";
    draft.releasedAt = new Date().toISOString();

    for (const line of draft.lines) {
      const inv = this.snapshot.inventory.find((i) => i.sku === line.sku);
      if (inv) {
        inv.allocated = round2(inv.allocated + line.quantity);
        inv.available = round2(inv.available - line.quantity);
      }
      this.appendAudit(
        item.email.emailId,
        "system",
        "allocated_stock",
        `Allocated ${line.quantity} of ${line.sku} to ${draft.soNumber}`,
      );
    }
    const customer = this.snapshot.customers.find((c) => c.customerId === draft.customerId);
    if (customer) {
      customer.openBalance = round2(customer.openBalance + orderValue);
      this.appendAudit(
        item.email.emailId,
        "system",
        "consumed_credit",
        `Consumed $${orderValue} credit for ${customer.customerId} (balance now $${customer.openBalance})`,
      );
    }
    this.appendAudit(
      item.email.emailId,
      "human",
      "released",
      `Released ${draft.soNumber} (${draft.lines.length} lines, $${orderValue})`,
    );
  }

  private validateDraftForRelease(draft: DraftState): { ok: boolean; reasons: string[]; orderValue?: number } {
    if (draft.status !== "DRAFT") {
      return { ok: false, reasons: [`Draft ${draft.soNumber} is already ${draft.status}`] };
    }
    const draftProposal = {
      customerId: draft.customerId,
      customerName: draft.customerName,
      shipToId: draft.shipToId,
      customerPo: draft.customerPo,
      requestedDate: draft.requestedDate,
      lines: draft.lines,
      orderTotal: draft.orderTotal,
    };
    const v = validateRelease(draftProposal, this.snapshot, this.releaseDate);
    if (!v.ok) return { ok: false, reasons: v.issues.map((i) => i.message) };
    return { ok: true, reasons: [], orderValue: v.orderValue };
  }

  async release(emailId: string, soNumber: string): Promise<ActionResult> {
    const item = this.byId.get(emailId);
    const draft = item?.drafts.find((d) => d.soNumber === soNumber);
    if (!item || !draft) return { ok: false, reasons: ["Draft not found"] };
    const v = this.validateDraftForRelease(draft);
    if (!v.ok) return { ok: false, reasons: v.reasons };
    this.applyRelease(item, draft, v.orderValue ?? draft.orderTotal);
    return { ok: true, reasons: [] };
  }

  async releaseWithEdits(emailId: string, soNumber: string, edits: ReleaseEdit): Promise<ActionResult> {
    const item = this.byId.get(emailId);
    const draft = item?.drafts.find((d) => d.soNumber === soNumber);
    if (!item || !draft) return { ok: false, reasons: ["Draft not found"] };
    if (draft.status !== "DRAFT") return { ok: false, reasons: [`Draft ${draft.soNumber} is already ${draft.status}`] };

    const editedLines: OrderLineProposal[] = edits.lines.map((e, idx) => {
      const original = draft.lines.find((l) => l.sku === e.sku);
      const price = resolveUnitPrice(e.sku, draft.customerId, this.releaseDate, this.snapshot.prices, this.snapshot.products);
      const unitPrice = price ? price.unitPrice : original?.unitPrice ?? 0;
      return {
        lineNo: idx + 1,
        sku: e.sku,
        description: original?.description ?? "",
        quantity: e.quantity,
        unitPrice,
        priceSource: price ? price.source : (original?.priceSource ?? "list"),
        lineTotal: round2(unitPrice * e.quantity),
      };
    });
    const orderTotal = round2(editedLines.reduce((s, l) => s + l.lineTotal, 0));

    const proposal = {
      customerId: draft.customerId,
      customerName: draft.customerName,
      shipToId: edits.shipToId,
      customerPo: draft.customerPo,
      requestedDate: edits.requestedDate,
      lines: editedLines,
      orderTotal,
    };
    const v = validateRelease(proposal, this.snapshot, this.releaseDate);
    if (!v.ok) return { ok: false, reasons: v.issues.map((i) => i.message) };

    draft.lines = editedLines;
    draft.shipToId = edits.shipToId;
    draft.requestedDate = edits.requestedDate;
    draft.orderTotal = orderTotal;
    this.appendAudit(item.email.emailId, "human", "edited", `Edited ${draft.soNumber} before release`);
    this.applyRelease(item, draft, v.orderValue);
    return { ok: true, reasons: [] };
  }

  async reject(emailId: string, soNumber: string | null, reason: string): Promise<ActionResult> {
    const item = this.byId.get(emailId);
    if (!item) return { ok: false, reasons: ["Email not found"] };
    if (soNumber) {
      const draft = item.drafts.find((d) => d.soNumber === soNumber);
      if (!draft) return { ok: false, reasons: ["Draft not found"] };
      draft.status = "REJECTED";
      draft.rejectReason = reason;
      this.appendAudit(emailId, "human", "rejected", `Rejected ${soNumber}: ${reason}`);
    } else {
      item.emailState = "no_action";
      item.emailRejectReason = reason;
      this.appendAudit(emailId, "human", "rejected", `Rejected ${emailId}: ${reason}`);
    }
    return { ok: true, reasons: [] };
  }

  async markNoAction(emailId: string): Promise<ActionResult> {
    const item = this.byId.get(emailId);
    if (!item) return { ok: false, reasons: ["Email not found"] };
    item.emailState = "no_action";
    this.appendAudit(emailId, "human", "no_action", `Marked ${emailId} as no action`);
    return { ok: true, reasons: [] };
  }

  async bulkRelease(emailIds: string[]): Promise<{ emailId: string; result: ActionResult }[]> {
    const out: { emailId: string; result: ActionResult }[] = [];
    for (const emailId of emailIds) {
      const item = this.byId.get(emailId);
      if (!item) {
        out.push({ emailId, result: { ok: false, reasons: ["Email not found"] } });
        continue;
      }
      const draftReasons: string[] = [];
      let anyOk = false;
      for (const draft of item.drafts.filter((d) => d.status === "DRAFT")) {
        const v = this.validateDraftForRelease(draft);
        if (v.ok) {
          this.applyRelease(item, draft, v.orderValue ?? draft.orderTotal);
          anyOk = true;
        } else {
          draftReasons.push(`${draft.soNumber}: ${v.reasons.join("; ")}`);
        }
      }
      out.push({
        emailId,
        result: anyOk || draftReasons.length === 0 ? { ok: true, reasons: [] } : { ok: false, reasons: draftReasons },
      });
    }
    return out;
  }

  async approveChange(emailId: string): Promise<ActionResult> {
    const item = this.byId.get(emailId);
    if (!item) return { ok: false, reasons: ["Email not found"] };
    const proposal = item.result.changeProposal;
    if (!proposal) return { ok: false, reasons: ["No change proposal"] };
    const v = validateChangeApproval(proposal.soNumber, this.snapshot);
    if (!v.ok) return { ok: false, reasons: [v.reason ?? "Change cannot be applied"] };
    item.emailState = "no_action";
    this.appendAudit(emailId, "human", "approved_change", `Approved change to ${proposal.soNumber}: ${proposal.description}`);
    return { ok: true, reasons: [] };
  }

  async getSnapshot(): Promise<ErpSnapshot> {
    return this.snapshot;
  }
}
