import "dotenv/config";
import { loadSnapshot, loadEmails, hasDataPack } from "../data/load.js";
import { getDatabaseUrl, createDb } from "../db/index.js";
import * as s from "../db/schema.js";

function num(v: number): string {
  return v.toFixed(2);
}

async function main(): Promise<void> {
  const url = getDatabaseUrl();
  if (!url) {
    console.error("DATABASE_URL is not set. Seed requires a Postgres database.");
    process.exit(1);
  }
  if (!hasDataPack()) {
    console.error("Data pack not found under assessment/data-pack.");
    process.exit(1);
  }

  const db = createDb(url);
  const snap = loadSnapshot();
  const emails = loadEmails();

  for (const c of snap.customers) {
    await db
      .insert(s.customers)
      .values({
        customerId: c.customerId,
        name: c.name,
        paymentTerms: c.paymentTerms,
        creditLimit: num(c.creditLimit),
        openBalance: num(c.openBalance),
        status: c.status,
      })
      .onConflictDoUpdate({ target: s.customers.customerId, set: { name: c.name, status: c.status, creditLimit: num(c.creditLimit), openBalance: num(c.openBalance) } });
  }

  for (const c of snap.contacts) {
    await db
      .insert(s.customerContacts)
      .values({ customerId: c.customerId, name: c.name, email: c.email, role: c.role })
      .onConflictDoUpdate({ target: s.customerContacts.email, set: { customerId: c.customerId, name: c.name, role: c.role } });
  }

  for (const a of snap.shipTos) {
    await db
      .insert(s.shipToAddresses)
      .values({ shipToId: a.shipToId, customerId: a.customerId, name: a.name, address: a.address, isDefault: a.isDefault })
      .onConflictDoUpdate({ target: s.shipToAddresses.shipToId, set: { customerId: a.customerId, name: a.name, address: a.address, isDefault: a.isDefault } });
  }

  for (const p of snap.products) {
    await db
      .insert(s.products)
      .values({ sku: p.sku, name: p.name, category: p.category, sellUom: p.sellUom, pack: p.pack, listPrice: num(p.listPrice), status: p.status, replacedBy: p.replacedBy })
      .onConflictDoUpdate({ target: s.products.sku, set: { name: p.name, category: p.category, sellUom: p.sellUom, pack: p.pack, listPrice: num(p.listPrice), status: p.status, replacedBy: p.replacedBy } });
  }

  for (const p of snap.prices) {
    await db
      .insert(s.customerPrices)
      .values({ customerId: p.customerId, sku: p.sku, unitPrice: num(p.unitPrice), validFrom: p.validFrom, validTo: p.validTo })
      .onConflictDoNothing();
  }

  for (const i of snap.inventory) {
    await db
      .insert(s.inventory)
      .values({ sku: i.sku, onHand: num(i.onHand), allocated: num(i.allocated), available: num(i.available) })
      .onConflictDoUpdate({ target: s.inventory.sku, set: { onHand: num(i.onHand), allocated: num(i.allocated), available: num(i.available) } });
  }

  for (const i of snap.incoming) {
    await db.insert(s.incomingSupply).values({ supplierPo: i.supplierPo, sku: i.sku, qty: num(i.qty), expectedDate: i.expectedDate }).onConflictDoNothing();
  }

  for (const o of snap.orders) {
    await db
      .insert(s.salesOrders)
      .values({ soNumber: o.soNumber, customerId: o.customerId, shipToId: o.shipToId, customerPo: o.customerPo, orderDate: o.orderDate, requestedDate: o.requestedDate, status: o.status, draft: false, createdByAgent: false })
      .onConflictDoUpdate({ target: s.salesOrders.soNumber, set: { status: o.status, customerPo: o.customerPo } });
  }

  for (const l of snap.orderLines) {
    await db
      .insert(s.salesOrderLines)
      .values({ soNumber: l.soNumber, lineNo: l.lineNo, sku: l.sku, qtyOrdered: num(l.qtyOrdered), qtyShipped: num(l.qtyShipped), unitPrice: num(l.unitPrice) })
      .onConflictDoNothing();
  }

  for (const e of emails) {
    await db
      .insert(s.emails)
      .values({
        emailId: e.emailId,
        receivedAt: e.receivedAt,
        fromName: e.fromName,
        fromEmail: e.fromEmail,
        to: e.to,
        subject: e.subject,
        body: e.body,
        attachments: JSON.stringify(e.attachments ?? []),
        reviewStatus: "pending",
      })
      .onConflictDoUpdate({ target: s.emails.emailId, set: { reviewStatus: "pending" } });
  }

  // Verify a round-trip read so this is not a no-op.
  const count = await db.select({ c: s.customers.customerId }).from(s.customers);
  console.log(`Seed complete. customers=${count.length} emails=${emails.length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
