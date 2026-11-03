import { asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as s from "../db/schema.js";
import { runOffline } from "../agent/offline.js";
import { loadSnapshot, loadEmails } from "../data/load.js";
import { validateRelease, validateChangeApproval } from "../core/release.js";
import { detectInjection } from "../core/injection.js";
import { resolveUnitPrice } from "../core/pricing.js";
import { seedDatabase } from "../seed/seed.js";
import type {
  Classification,
  ChangeProposal,
  Disposition,
  Email,
  ErpSnapshot,
  OrderLineProposal,
  ProcessingResult,
  DraftOrderProposal,
} from "../core/types.js";
import type {
  Actor,
  ActionResult,
  AgentRunUsage,
  AgentStatus,
  AuditRecord,
  Dashboard,
  DraftState,
  InboxItem,
  ReleaseEdit,
  Repository,
  ShipToOption,
} from "./types.js";

type Db = NodePgDatabase<typeof s>;

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function num(v: number): string {
  return String(Math.round(v * 100) / 100);
}

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

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function iso(t: Date | string | null | undefined): string | null {
  if (t == null) return null;
  return t instanceof Date ? t.toISOString() : String(t);
}

export class PgRepository implements Repository {
  constructor(
    private db: Db,
    private releaseDate = "2026-11-02",
  ) {}

  // ---------------------------------------------------------------------------
  // Ingest / persist
  // ---------------------------------------------------------------------------

  async processInbox(): Promise<ProcessingResult[]> {
    const snapshot = loadSnapshot();
    const emails = loadEmails();
    const results = runOffline(emails, snapshot, this.releaseDate);
    await this.persistResults(results, emails, snapshot);
    return results;
  }

  async listUnprocessed(limit: number): Promise<Email[]> {
    const rows = await this.db
      .select()
      .from(s.emails)
      .where(isNull(s.emails.processedAt))
      .orderBy(asc(s.emails.receivedAt))
      .limit(limit);
    return rows.map((e) => ({
      emailId: e.emailId,
      receivedAt: e.receivedAt,
      fromName: e.fromName ?? "",
      fromEmail: e.fromEmail,
      to: e.to ?? "",
      subject: e.subject ?? "",
      body: e.body,
      attachments: safeJson<unknown[]>(e.attachments, []),
    }));
  }

  async saveAgentResults(results: ProcessingResult[], usage: AgentRunUsage, model: string): Promise<void> {
    const emails = await this.db.select().from(s.emails);
    const emailRows: Email[] = emails.map((e) => ({
      emailId: e.emailId,
      receivedAt: e.receivedAt,
      fromName: e.fromName ?? "",
      fromEmail: e.fromEmail,
      to: e.to ?? "",
      subject: e.subject ?? "",
      body: e.body,
      attachments: safeJson<unknown[]>(e.attachments, []),
    }));
    await this.persistResults(results, emailRows, await this.loadSnapshot());
    await this.db.insert(s.agentRuns).values({
      model,
      finishedAt: new Date(),
      emailsProcessed: results.length,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      costUsd: usage.costUsd.toFixed(6),
      status: "done",
    });
  }

  async getAgentStatus(): Promise<AgentStatus> {
    const [counts, runs, totals] = await Promise.all([
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          processed: sql<number>`count(${s.emails.processedAt})::int`,
        })
        .from(s.emails),
      this.db.select({ n: sql<number>`count(*)::int`, last: sql<string | null>`max(${s.agentRuns.finishedAt})` }).from(s.agentRuns),
      this.db
        .select({
          tokensIn: sql<number>`coalesce(sum(${s.agentRuns.tokensIn}), 0)::int`,
          tokensOut: sql<number>`coalesce(sum(${s.agentRuns.tokensOut}), 0)::int`,
          costUsd: sql<string>`coalesce(sum(${s.agentRuns.costUsd}), 0)`,
          model: sql<string | null>`max(${s.agentRuns.model})`,
        })
        .from(s.agentRuns),
    ]);
    const total = counts[0]?.total ?? 0;
    const processed = counts[0]?.processed ?? 0;
    return {
      model:
        totals[0]?.model ??
        process.env.AGENT_MODEL ??
        (process.env.OPENCODE_GO_API_KEY ? "glm-5.3-flash" : "openai/gpt-4o-mini"),
      total,
      processed,
      remaining: total - processed,
      tokensIn: totals[0]?.tokensIn ?? 0,
      tokensOut: totals[0]?.tokensOut ?? 0,
      costUsd: toNum(totals[0]?.costUsd),
      runs: runs[0]?.n ?? 0,
      lastRunAt: runs[0]?.last ?? null,
    };
  }

  async resetDemo(): Promise<void> {
    await this.db.execute(
      sql`TRUNCATE TABLE audit_log, review_items, sales_order_lines, sales_orders, emails, agent_runs,
          incoming_supply, inventory, customer_prices, products, ship_to_addresses, customer_contacts,
          customers RESTART IDENTITY CASCADE`,
    );
    await seedDatabase(this.db as unknown as Parameters<typeof seedDatabase>[0]);
  }

  private async persistResults(results: ProcessingResult[], emails: Email[], snapshot: ErpSnapshot): Promise<void> {
    const byEmail = new Map(emails.map((e) => [e.emailId, e]));
    let nextSo = maxOrderNumber(snapshot) + 1;

    for (const result of results) {
      const email = byEmail.get(result.emailId);
      if (!email) continue;

      await this.db
        .insert(s.emails)
        .values({
          emailId: email.emailId,
          receivedAt: email.receivedAt,
          fromName: email.fromName,
          fromEmail: email.fromEmail,
          to: email.to,
          subject: email.subject,
          body: email.body,
          attachments: JSON.stringify(email.attachments ?? []),
          classification: result.classification,
          disposition: result.disposition,
          customerId: result.customerId,
          issuesJson: JSON.stringify(result.issues),
          notesJson: JSON.stringify(result.notes),
          changeProposalJson: result.changeProposal ? JSON.stringify(result.changeProposal) : null,
          duplicateOfEmailId: result.duplicateOfEmailId,
          processedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: s.emails.emailId,
          set: {
            classification: result.classification,
            disposition: result.disposition,
            customerId: result.customerId,
            issuesJson: JSON.stringify(result.issues),
            notesJson: JSON.stringify(result.notes),
            changeProposalJson: result.changeProposal ? JSON.stringify(result.changeProposal) : null,
            duplicateOfEmailId: result.duplicateOfEmailId,
            processedAt: new Date(),
          },
        });

      for (const draft of result.drafts) {
        const soNumber = `SO-${nextSo++}`;
        await this.db
          .insert(s.salesOrders)
          .values({
            soNumber,
            customerId: draft.customerId,
            shipToId: draft.shipToId,
            customerPo: draft.customerPo,
            orderDate: this.releaseDate,
            requestedDate: draft.requestedDate,
            status: "OPEN",
            draft: true,
            createdByAgent: true,
            sourceEmailId: result.emailId,
          })
          .onConflictDoNothing({ target: s.salesOrders.soNumber });

        for (const line of draft.lines) {
          await this.db
            .insert(s.salesOrderLines)
            .values({
              soNumber,
              lineNo: line.lineNo,
              sku: line.sku,
              description: line.description,
              qtyOrdered: num(line.quantity),
              qtyShipped: "0",
              unitPrice: num(line.unitPrice),
              priceSource: line.priceSource,
            })
            .onConflictDoNothing({ target: [s.salesOrderLines.soNumber, s.salesOrderLines.lineNo] });
        }
      }

      for (const entry of result.audit) {
        await this.db
          .insert(s.auditLog)
          .values({
            emailId: result.emailId,
            actor: "agent",
            action: entry.action,
            detail: entry.detail,
            dedupeKey: `${result.emailId}:agent:${entry.action}:${entry.detail}`,
          })
          .onConflictDoNothing({ target: s.auditLog.dedupeKey });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  private async loadSnapshot(): Promise<ErpSnapshot> {
    const [customers, contacts, shipTos, products, prices, inventory, incoming, orders, orderLines] = await Promise.all([
      this.db.select().from(s.customers),
      this.db.select().from(s.customerContacts),
      this.db.select().from(s.shipToAddresses),
      this.db.select().from(s.products),
      this.db.select().from(s.customerPrices),
      this.db.select().from(s.inventory),
      this.db.select().from(s.incomingSupply),
      this.db.select().from(s.salesOrders),
      this.db.select().from(s.salesOrderLines),
    ]);

    return {
      customers: customers.map((c) => ({
        customerId: c.customerId,
        name: c.name,
        paymentTerms: c.paymentTerms ?? "",
        creditLimit: toNum(c.creditLimit),
        openBalance: toNum(c.openBalance),
        status: c.status as "ACTIVE" | "CREDIT_HOLD",
      })),
      contacts: contacts.map((c) => ({ customerId: c.customerId, name: c.name, email: c.email, role: c.role ?? "" })),
      shipTos: shipTos.map((a) => ({
        shipToId: a.shipToId,
        customerId: a.customerId,
        name: a.name,
        address: a.address,
        isDefault: a.isDefault,
      })),
      products: products.map((p) => ({
        sku: p.sku,
        name: p.name,
        category: p.category ?? "",
        sellUom: (p.sellUom ?? "CS") as "CS" | "EA",
        pack: p.pack ?? "",
        listPrice: toNum(p.listPrice),
        status: p.status as "ACTIVE" | "DISCONTINUED",
        replacedBy: p.replacedBy ?? null,
      })),
      prices: prices.map((p) => ({
        customerId: p.customerId,
        sku: p.sku,
        unitPrice: toNum(p.unitPrice),
        validFrom: p.validFrom,
        validTo: p.validTo,
      })),
      inventory: inventory.map((i) => ({
        sku: i.sku,
        onHand: toNum(i.onHand),
        allocated: toNum(i.allocated),
        available: toNum(i.available),
      })),
      incoming: incoming.map((i) => ({
        supplierPo: i.supplierPo,
        sku: i.sku,
        qty: toNum(i.qty),
        expectedDate: i.expectedDate,
      })),
      orders: orders.map((o) => ({
        soNumber: o.soNumber,
        customerId: o.customerId,
        shipToId: o.shipToId ?? "",
        customerPo: o.customerPo ?? "",
        orderDate: o.orderDate,
        requestedDate: o.requestedDate ?? "",
        status: o.status as "OPEN" | "SHIPPED" | "PARTIALLY_SHIPPED",
        draft: o.draft,
        createdByAgent: o.createdByAgent,
        releasedAt: iso(o.releasedAt),
      })),
      orderLines: orderLines.map((l) => ({
        soNumber: l.soNumber,
        lineNo: l.lineNo,
        sku: l.sku,
        qtyOrdered: toNum(l.qtyOrdered),
        qtyShipped: toNum(l.qtyShipped),
        unitPrice: toNum(l.unitPrice),
      })),
    };
  }

  private customerName(snapshot: ErpSnapshot, customerId: string | null): string | null {
    if (!customerId) return null;
    return snapshot.customers.find((c) => c.customerId === customerId)?.name ?? null;
  }

  private toLine(l: typeof s.salesOrderLines.$inferSelect): OrderLineProposal {
    const unitPrice = toNum(l.unitPrice);
    const quantity = toNum(l.qtyOrdered);
    return {
      lineNo: l.lineNo,
      sku: l.sku,
      description: l.description ?? "",
      quantity,
      unitPrice,
      priceSource: (l.priceSource ?? "list") as OrderLineProposal["priceSource"],
      lineTotal: round2(unitPrice * quantity),
    };
  }

  private toProposal(order: typeof s.salesOrders.$inferSelect, lines: OrderLineProposal[], snapshot: ErpSnapshot): DraftOrderProposal {
    const orderTotal = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0));
    return {
      customerId: order.customerId,
      customerName: this.customerName(snapshot, order.customerId) ?? "",
      shipToId: order.shipToId ?? "",
      customerPo: order.customerPo ?? "",
      requestedDate: order.requestedDate ?? null,
      lines,
      orderTotal,
    };
  }

  async listInbox(): Promise<InboxItem[]> {
    const [snapshot, emailRows, orderRows, lineRows, auditRows] = await Promise.all([
      this.loadSnapshot(),
      this.db.select().from(s.emails).orderBy(asc(s.emails.receivedAt)),
      this.db.select().from(s.salesOrders),
      this.db.select().from(s.salesOrderLines).orderBy(asc(s.salesOrderLines.lineNo)),
      this.db.select().from(s.auditLog),
    ]);

    const linesByOrder = new Map<string, (typeof s.salesOrderLines.$inferSelect)[]>();
    for (const l of lineRows) {
      const list = linesByOrder.get(l.soNumber) ?? [];
      list.push(l);
      linesByOrder.set(l.soNumber, list);
    }
    const auditByEmail = new Map<string, AuditRecord[]>();
    for (const a of auditRows) {
      const list = auditByEmail.get(a.emailId ?? "") ?? [];
      list.push({ id: a.id, timestamp: iso(a.createdAt) ?? "", emailId: a.emailId, actor: a.actor as Actor, action: a.action, detail: a.detail });
      auditByEmail.set(a.emailId ?? "", list);
    }

    return emailRows.map((e) => this.buildItem(e, snapshot, orderRows, linesByOrder, auditByEmail));
  }

  private buildItem(
    e: typeof s.emails.$inferSelect,
    snapshot: ErpSnapshot,
    orderRows: (typeof s.salesOrders.$inferSelect)[],
    linesByOrder: Map<string, (typeof s.salesOrderLines.$inferSelect)[]>,
    auditByEmail: Map<string, AuditRecord[]>,
  ): InboxItem {
    const customerName = this.customerName(snapshot, e.customerId);
    const orders = orderRows.filter((o) => o.sourceEmailId === e.emailId);

    const drafts: DraftState[] = orders.map((o) => {
      const lines = (linesByOrder.get(o.soNumber) ?? []).map((l) => this.toLine(l));
      const orderTotal = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0));
      const status: DraftState["status"] = o.rejectedReason ? "REJECTED" : o.draft ? "DRAFT" : "RELEASED";
      return {
        soNumber: o.soNumber,
        emailId: e.emailId,
        customerId: o.customerId,
        customerName: this.customerName(snapshot, o.customerId) ?? "",
        shipToId: o.shipToId ?? "",
        customerPo: o.customerPo ?? "",
        requestedDate: o.requestedDate ?? null,
        lines,
        orderTotal,
        status,
        releasedAt: iso(o.releasedAt),
        rejectReason: o.rejectedReason ?? null,
      };
    });

    const amount = drafts.length > 0 ? round2(drafts.reduce((sum, d) => sum + d.orderTotal, 0)) : null;

    const result: ProcessingResult = {
      emailId: e.emailId,
      receivedAt: e.receivedAt,
      fromEmail: e.fromEmail,
      subject: e.subject ?? "",
      classification: (e.classification ?? "ORDER") as Classification,
      disposition: (e.disposition ?? "ESCALATE") as Disposition,
      customerId: e.customerId,
      customerName,
      customerFound: e.customerId != null,
      injection: detectInjection(e.body),
      drafts: drafts.map((d) => ({
        customerId: d.customerId,
        customerName: d.customerName,
        shipToId: d.shipToId,
        customerPo: d.customerPo,
        requestedDate: d.requestedDate,
        lines: d.lines,
        orderTotal: d.orderTotal,
      })),
      changeProposal: safeJson<ChangeProposal | null>(e.changeProposalJson, null),
      issues: safeJson(e.issuesJson, []),
      audit: (auditByEmail.get(e.emailId) ?? []).map((a) => ({ actor: a.actor, action: a.action, detail: a.detail })),
      duplicateOfEmailId: e.duplicateOfEmailId ?? null,
      notes: safeJson(e.notesJson, []),
    };

    return {
      email: {
        emailId: e.emailId,
        receivedAt: e.receivedAt,
        fromName: e.fromName ?? "",
        fromEmail: e.fromEmail,
        to: e.to ?? "",
        subject: e.subject ?? "",
        body: e.body,
        attachments: safeJson(e.attachments, []),
      },
      result,
      drafts,
      amount,
      emailState: e.reviewStatus === "no_action" ? "no_action" : "pending",
      emailRejectReason: e.rejectReason ?? null,
      processed: e.processedAt != null,
      reviewStatus: e.reviewStatus,
    };
  }

  async getEmail(emailId: string): Promise<InboxItem | null> {
    const [snapshot, emailRows, orderRows, auditRows] = await Promise.all([
      this.loadSnapshot(),
      this.db.select().from(s.emails).where(eq(s.emails.emailId, emailId)).limit(1),
      this.db.select().from(s.salesOrders).where(eq(s.salesOrders.sourceEmailId, emailId)),
      this.db.select().from(s.auditLog).where(eq(s.auditLog.emailId, emailId)),
    ]);
    const email = emailRows[0];
    if (!email) return null;

    const soNumbers = orderRows.map((o) => o.soNumber);
    const lineRows = soNumbers.length
      ? await this.db.select().from(s.salesOrderLines).where(inArray(s.salesOrderLines.soNumber, soNumbers))
      : [];

    const linesByOrder = new Map<string, (typeof s.salesOrderLines.$inferSelect)[]>();
    for (const l of lineRows) {
      const list = linesByOrder.get(l.soNumber) ?? [];
      list.push(l);
      linesByOrder.set(l.soNumber, list);
    }
    const auditByEmail = new Map<string, AuditRecord[]>();
    auditByEmail.set(
      emailId,
      auditRows.map((a) => ({
        id: a.id,
        timestamp: iso(a.createdAt) ?? "",
        emailId: a.emailId,
        actor: a.actor as Actor,
        action: a.action,
        detail: a.detail,
      })),
    );

    return this.buildItem(email, snapshot, orderRows, linesByOrder, auditByEmail);
  }

  async listEmailOptions(): Promise<{ emailId: string; subject: string }[]> {
    const rows = await this.db
      .select({ emailId: s.emails.emailId, subject: s.emails.subject })
      .from(s.emails)
      .orderBy(desc(s.emails.receivedAt));
    return rows.map((r) => ({ emailId: r.emailId, subject: r.subject ?? "" }));
  }

  async listAudit(filter?: { emailId?: string; actor?: Actor }): Promise<AuditRecord[]> {
    let q = this.db.select().from(s.auditLog).$dynamic();
    if (filter?.emailId) q = q.where(eq(s.auditLog.emailId, filter.emailId));
    if (filter?.actor) q = q.where(eq(s.auditLog.actor, filter.actor));
    // Newest first, capped: the trail grows with every run and the page only
    // ever shows the last few hundred events.
    const rows = await q.orderBy(desc(s.auditLog.id)).limit(300);
    return rows.map((a) => ({
      id: a.id,
      timestamp: iso(a.createdAt) ?? "",
      emailId: a.emailId,
      actor: a.actor as Actor,
      action: a.action,
      detail: a.detail,
    }));
  }

  async listShipTos(customerId: string): Promise<ShipToOption[]> {
    const rows = await this.db.select().from(s.shipToAddresses).where(eq(s.shipToAddresses.customerId, customerId));
    return rows.map((a) => ({ shipToId: a.shipToId, name: a.name, address: a.address, isDefault: a.isDefault }));
  }

  async getDashboard(): Promise<Dashboard> {
    const [inv, prods, custs, orders, lines] = await Promise.all([
      this.db.select().from(s.inventory),
      this.db.select().from(s.products),
      this.db.select().from(s.customers),
      this.db.select().from(s.salesOrders),
      this.db.select().from(s.salesOrderLines),
    ]);

    const productBySku = new Map(prods.map((p) => [p.sku, p]));
    const customerName = new Map(custs.map((c) => [c.customerId, c.name]));
    const valueByOrder = new Map<string, number>();
    for (const l of lines) {
      valueByOrder.set(l.soNumber, (valueByOrder.get(l.soNumber) ?? 0) + toNum(l.qtyOrdered) * toNum(l.unitPrice));
    }

    const inventory = inv
      .map((i) => ({
        sku: i.sku,
        name: productBySku.get(i.sku)?.name ?? i.sku,
        listPrice: toNum(productBySku.get(i.sku)?.listPrice),
        onHand: toNum(i.onHand),
        allocated: toNum(i.allocated),
        available: toNum(i.available),
        status: productBySku.get(i.sku)?.status ?? "active",
      }))
      .sort((a, b) => a.available - b.available || a.sku.localeCompare(b.sku));

    const customers = custs
      .map((c) => ({
        customerId: c.customerId,
        name: c.name,
        creditLimit: toNum(c.creditLimit),
        openBalance: toNum(c.openBalance),
        headroom: round2(toNum(c.creditLimit) - toNum(c.openBalance)),
        status: c.status,
      }))
      .sort((a, b) => a.headroom - b.headroom);

    const orderRows = orders
      .map((o) => ({
        soNumber: o.soNumber,
        customerName: customerName.get(o.customerId) ?? o.customerId,
        status: o.releasedAt ? "RELEASED" : o.draft ? "DRAFT" : o.status,
        total: round2(valueByOrder.get(o.soNumber) ?? 0),
        releasedAt: o.releasedAt ? o.releasedAt.toISOString() : null,
      }))
      .sort((a, b) => Number(a.status === "DRAFT") - Number(b.status === "DRAFT") || b.soNumber.localeCompare(a.soNumber))
      .slice(0, 25);

    return {
      inventory,
      customers,
      orders: orderRows,
      totals: {
        products: inventory.length,
        lowStock: inventory.filter((i) => i.available < 10).length,
        creditLimit: round2(customers.reduce((n, c) => n + c.creditLimit, 0)),
        creditUsed: round2(customers.reduce((n, c) => n + c.openBalance, 0)),
        openOrders: orderRows.filter((o) => o.status === "DRAFT").length,
        released: orderRows.filter((o) => o.status === "RELEASED").length,
      },
    };
  }

  async getSnapshot(): Promise<ErpSnapshot> {
    return this.loadSnapshot();
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  private async findOrder(emailId: string, soNumber: string): Promise<typeof s.salesOrders.$inferSelect | null> {
    const rows = await this.db
      .select()
      .from(s.salesOrders)
      .where(eq(s.salesOrders.soNumber, soNumber));
    const order = rows.find((o) => o.sourceEmailId === emailId) ?? rows[0];
    return order ?? null;
  }

  private async loadLines(soNumber: string): Promise<OrderLineProposal[]> {
    const rows = await this.db
      .select()
      .from(s.salesOrderLines)
      .where(eq(s.salesOrderLines.soNumber, soNumber))
      .orderBy(asc(s.salesOrderLines.lineNo));
    return rows.map((l) => this.toLine(l));
  }

  private async insertAudit(emailId: string | null, actor: Actor, action: string, detail: string): Promise<void> {
    await this.db.insert(s.auditLog).values({ emailId, actor, action, detail });
  }

  private async applyRelease(
    emailId: string,
    order: typeof s.salesOrders.$inferSelect,
    lines: OrderLineProposal[],
    orderValue: number,
    snapshot: ErpSnapshot,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(s.salesOrders).set({ draft: false, releasedAt: new Date() }).where(eq(s.salesOrders.soNumber, order.soNumber));
      await tx.update(s.emails).set({ reviewStatus: "released" }).where(eq(s.emails.emailId, emailId));

      for (const line of lines) {
        const inv = snapshot.inventory.find((i) => i.sku === line.sku);
        if (inv) {
          await tx
            .update(s.inventory)
            .set({ allocated: num(inv.allocated + line.quantity), available: num(inv.available - line.quantity) })
            .where(eq(s.inventory.sku, line.sku));
        }
        await tx.insert(s.auditLog).values({
          emailId,
          actor: "system",
          action: "allocated_stock",
          detail: `Allocated ${line.quantity} of ${line.sku} to ${order.soNumber}`,
        });
      }

      const customer = snapshot.customers.find((c) => c.customerId === order.customerId);
      if (customer) {
        await tx
          .update(s.customers)
          .set({ openBalance: num(customer.openBalance + orderValue) })
          .where(eq(s.customers.customerId, customer.customerId));
        await tx.insert(s.auditLog).values({
          emailId,
          actor: "system",
          action: "consumed_credit",
          detail: `Consumed $${orderValue} credit for ${customer.customerId} (balance now $${num(customer.openBalance + orderValue)})`,
        });
      }

      await tx.insert(s.auditLog).values({
        emailId,
        actor: "human",
        action: "released",
        detail: `Released ${order.soNumber} (${lines.length} lines, $${orderValue})`,
      });
    });
  }

  async release(emailId: string, soNumber: string): Promise<ActionResult> {
    const order = await this.findOrder(emailId, soNumber);
    if (!order) return { ok: false, reasons: ["Draft not found"] };
    if (order.rejectedReason) return { ok: false, reasons: [`Draft ${soNumber} is already REJECTED`] };
    if (!order.draft) return { ok: false, reasons: [`Draft ${soNumber} is already RELEASED`] };

    const snapshot = await this.loadSnapshot();
    const lines = await this.loadLines(soNumber);
    const proposal = this.toProposal(order, lines, snapshot);
    const v = validateRelease(proposal, snapshot, this.releaseDate);
    if (!v.ok) return { ok: false, reasons: v.issues.map((i) => i.message) };

    await this.applyRelease(emailId, order, lines, v.orderValue, snapshot);
    return {
      ok: true,
      reasons: [],
      detail: `Released ${order.soNumber} · ${lines.reduce((n, l) => n + l.quantity, 0)} units allocated · $${v.orderValue} credit used`,
    };
  }

  async releaseWithEdits(emailId: string, soNumber: string, edits: ReleaseEdit): Promise<ActionResult> {
    const order = await this.findOrder(emailId, soNumber);
    if (!order) return { ok: false, reasons: ["Draft not found"] };
    if (!order.draft) return { ok: false, reasons: [`Draft ${soNumber} is already ${order.rejectedReason ? "REJECTED" : "RELEASED"}`] };

    const snapshot = await this.loadSnapshot();
    const currentLines = await this.loadLines(soNumber);

    const editedLines: OrderLineProposal[] = edits.lines.map((e, idx) => {
      const original = currentLines.find((l) => l.sku === e.sku);
      const price = resolveUnitPrice(e.sku, order.customerId, this.releaseDate, snapshot.prices, snapshot.products);
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
    const orderTotal = round2(editedLines.reduce((sum, l) => sum + l.lineTotal, 0));

    const proposal: DraftOrderProposal = {
      customerId: order.customerId,
      customerName: this.customerName(snapshot, order.customerId) ?? "",
      shipToId: edits.shipToId,
      customerPo: order.customerPo ?? "",
      requestedDate: edits.requestedDate,
      lines: editedLines,
      orderTotal,
    };
    const v = validateRelease(proposal, snapshot, this.releaseDate);
    if (!v.ok) return { ok: false, reasons: v.issues.map((i) => i.message) };

    await this.db.transaction(async (tx) => {
      await tx.update(s.salesOrders).set({ shipToId: edits.shipToId, requestedDate: edits.requestedDate }).where(eq(s.salesOrders.soNumber, soNumber));
      for (const line of editedLines) {
        await tx
          .update(s.salesOrderLines)
          .set({ qtyOrdered: num(line.quantity), unitPrice: num(line.unitPrice), priceSource: line.priceSource })
          .where(eq(s.salesOrderLines.soNumber, soNumber) && eq(s.salesOrderLines.sku, line.sku));
      }
      await tx.insert(s.auditLog).values({ emailId, actor: "human", action: "edited", detail: `Edited ${soNumber} before release` });
    });

    await this.applyRelease(emailId, order, editedLines, v.orderValue, snapshot);
    return {
      ok: true,
      reasons: [],
      detail: `Released ${soNumber} with edits · ${editedLines.reduce((n, l) => n + l.quantity, 0)} units allocated · $${v.orderValue} credit used`,
    };
  }

  async reject(emailId: string, soNumber: string | null, reason: string): Promise<ActionResult> {
    const email = await this.db.select().from(s.emails).where(eq(s.emails.emailId, emailId));
    if (email.length === 0) return { ok: false, reasons: ["Email not found"] };

    if (soNumber) {
      const order = await this.findOrder(emailId, soNumber);
      if (!order) return { ok: false, reasons: ["Draft not found"] };
      await this.db.update(s.salesOrders).set({ rejectedReason: reason }).where(eq(s.salesOrders.soNumber, soNumber));
      await this.insertAudit(emailId, "human", "rejected", `Rejected ${soNumber}: ${reason}`);
    } else {
      await this.db.update(s.emails).set({ reviewStatus: "no_action", rejectReason: reason }).where(eq(s.emails.emailId, emailId));
      await this.insertAudit(emailId, "human", "rejected", `Rejected ${emailId}: ${reason}`);
    }
    return { ok: true, reasons: [], detail: `Rejected${soNumber ? ` ${soNumber}` : ""} — nothing released, stock and credit unchanged` };
  }

  async markNoAction(emailId: string): Promise<ActionResult> {
    const email = await this.db.select().from(s.emails).where(eq(s.emails.emailId, emailId));
    if (email.length === 0) return { ok: false, reasons: ["Email not found"] };
    await this.db.update(s.emails).set({ reviewStatus: "no_action" }).where(eq(s.emails.emailId, emailId));
    await this.insertAudit(emailId, "human", "no_action", `Marked ${emailId} as no action`);
    return { ok: true, reasons: [], detail: "Marked no action — nothing released" };
  }

  async bulkRelease(emailIds: string[]): Promise<{ emailId: string; result: ActionResult }[]> {
    const out: { emailId: string; result: ActionResult }[] = [];
    for (const emailId of emailIds) {
      const item = await this.getEmail(emailId);
      if (!item) {
        out.push({ emailId, result: { ok: false, reasons: ["Email not found"] } });
        continue;
      }
      const reasons: string[] = [];
      let anyOk = false;
      for (const draft of item.drafts.filter((d) => d.status === "DRAFT")) {
        const r = await this.release(emailId, draft.soNumber);
        if (r.ok) anyOk = true;
        else reasons.push(`${draft.soNumber}: ${r.reasons.join("; ")}`);
      }
      out.push({ emailId, result: anyOk || reasons.length === 0 ? { ok: true, reasons: [] } : { ok: false, reasons } });
    }
    return out;
  }

  async approveChange(emailId: string): Promise<ActionResult> {
    const email = await this.db.select().from(s.emails).where(eq(s.emails.emailId, emailId));
    if (email.length === 0) return { ok: false, reasons: ["Email not found"] };
    const proposal = safeJson<ChangeProposal | null>(email[0].changeProposalJson, null);
    if (!proposal) return { ok: false, reasons: ["No change proposal"] };

    const snapshot = await this.loadSnapshot();
    const v = validateChangeApproval(proposal.soNumber, snapshot);
    if (!v.ok) return { ok: false, reasons: [v.reason ?? "Change cannot be applied"] };

    const order = snapshot.orders.find((o) => o.soNumber === proposal.soNumber)!;
    const lines = snapshot.orderLines.filter((l) => l.soNumber === order.soNumber);
    const units = lines.reduce((n, l) => n + l.qtyOrdered, 0);
    const value = round2(lines.reduce((n, l) => n + l.qtyOrdered * l.unitPrice, 0));

    if (proposal.kind === "cancel" || proposal.kind === "return") {
      const status = proposal.kind === "cancel" ? "CANCELLED" : "RETURNED";
      await this.db.transaction(async (tx) => {
        await tx.update(s.salesOrders).set({ status }).where(eq(s.salesOrders.soNumber, order.soNumber));
        if (order.releasedAt) {
          for (const line of lines) {
            const inv = snapshot.inventory.find((i) => i.sku === line.sku);
            if (!inv) continue;
            await tx
              .update(s.inventory)
              .set({ allocated: num(inv.allocated - line.qtyOrdered), available: num(inv.available + line.qtyOrdered) })
              .where(eq(s.inventory.sku, line.sku));
            await tx.insert(s.auditLog).values({
              emailId,
              actor: "system",
              action: "returned_stock",
              detail: `Returned ${line.qtyOrdered} of ${line.sku} from ${order.soNumber} to stock`,
            });
          }
          const customer = snapshot.customers.find((c) => c.customerId === order.customerId);
          if (customer) {
            await tx
              .update(s.customers)
              .set({ openBalance: num(customer.openBalance - value) })
              .where(eq(s.customers.customerId, customer.customerId));
            await tx.insert(s.auditLog).values({
              emailId,
              actor: "system",
              action: "released_credit",
              detail: `Released $${value} credit for ${customer.customerId} (balance now $${num(customer.openBalance - value)})`,
            });
          }
        }
        await tx.update(s.emails).set({ reviewStatus: "approved" }).where(eq(s.emails.emailId, emailId));
        await tx.insert(s.auditLog).values({
          emailId,
          actor: "human",
          action: "approved_change",
          detail: `${status} ${order.soNumber} on the customer's request: ${proposal.description}`,
        });
      });
      return {
        ok: true,
        reasons: [],
        detail: `${proposal.kind === "cancel" ? "Cancelled" : "Returned"} ${order.soNumber} · ${units} units back to stock · $${value} credit released`,
      };
    }

    await this.db.update(s.emails).set({ reviewStatus: "approved" }).where(eq(s.emails.emailId, emailId));
    await this.insertAudit(emailId, "human", "approved_change", `Approved change to ${order.soNumber}: ${proposal.description}`);
    return {
      ok: true,
      reasons: [],
      detail: `Approved change to ${order.soNumber} — the revised quantities still have to be keyed in`,
    };
  }
}
