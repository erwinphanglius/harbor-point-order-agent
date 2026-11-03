import "dotenv/config";
import { pathToFileURL } from "node:url";
import { loadSnapshot, loadEmails, hasDataPack } from "../data/load.js";
import { getDatabaseUrl, createDb, type Db } from "../db/index.js";
import * as s from "../db/schema.js";

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

function num(v: number): string {
  return v.toFixed(2);
}

/**
 * Idempotently load the ERP snapshot and inbox into Postgres. Stores the raw
 * state the UI needs (customers, products, prices, stock, emails in "pending"
 * review); `npm run process` then persists the agent's classification,
 * disposition, drafts and audit rows.
 */
export async function seedDatabase(db: Db): Promise<void> {
  if (!hasDataPack()) {
    throw new Error("Data pack not found under assessment/data-pack.");
  }

  const snap = loadSnapshot();
  const emails = loadEmails();

  // One statement per table: a row-at-a-time seed costs a round trip per row,
  // which times out against a hosted database (the demo reset runs it live).
  await db
    .insert(s.customers)
    .values(
      snap.customers.map((c) => ({
        customerId: c.customerId,
        name: c.name,
        paymentTerms: c.paymentTerms,
        creditLimit: num(c.creditLimit),
        openBalance: num(c.openBalance),
        status: c.status,
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(s.customerContacts)
    .values(snap.contacts.map((c) => ({ customerId: c.customerId, name: c.name, email: c.email, role: c.role })))
    .onConflictDoNothing();

  await db
    .insert(s.shipToAddresses)
    .values(snap.shipTos.map((a) => ({ shipToId: a.shipToId, customerId: a.customerId, name: a.name, address: a.address, isDefault: a.isDefault })))
    .onConflictDoNothing();

  await db
    .insert(s.products)
    .values(
      snap.products.map((p) => ({
        sku: p.sku,
        name: p.name,
        category: p.category,
        sellUom: p.sellUom,
        pack: p.pack,
        listPrice: num(p.listPrice),
        status: p.status,
        replacedBy: p.replacedBy,
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(s.customerPrices)
    .values(snap.prices.map((p) => ({ customerId: p.customerId, sku: p.sku, unitPrice: num(p.unitPrice), validFrom: p.validFrom, validTo: p.validTo })))
    .onConflictDoNothing();

  await db
    .insert(s.inventory)
    .values(snap.inventory.map((i) => ({ sku: i.sku, onHand: num(i.onHand), allocated: num(i.allocated), available: num(i.available) })))
    .onConflictDoNothing();

  await db
    .insert(s.incomingSupply)
    .values(snap.incoming.map((i) => ({ supplierPo: i.supplierPo, sku: i.sku, qty: num(i.qty), expectedDate: i.expectedDate })))
    .onConflictDoNothing();

  await db
    .insert(s.salesOrders)
    .values(
      snap.orders.map((o) => ({
        soNumber: o.soNumber,
        customerId: o.customerId,
        shipToId: o.shipToId,
        customerPo: o.customerPo,
        orderDate: o.orderDate,
        requestedDate: o.requestedDate,
        status: o.status,
        draft: false,
        createdByAgent: false,
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(s.salesOrderLines)
    .values(
      snap.orderLines.map((l) => ({
        soNumber: l.soNumber,
        lineNo: l.lineNo,
        sku: l.sku,
        qtyOrdered: num(l.qtyOrdered),
        qtyShipped: num(l.qtyShipped),
        unitPrice: num(l.unitPrice),
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(s.emails)
    .values(
      emails.map((e) => ({
        emailId: e.emailId,
        receivedAt: e.receivedAt,
        fromName: e.fromName,
        fromEmail: e.fromEmail,
        to: e.to,
        subject: e.subject,
        body: e.body,
        attachments: JSON.stringify(e.attachments ?? []),
        reviewStatus: "pending",
      })),
    )
    .onConflictDoNothing();
}

async function main(): Promise<void> {
  const url = getDatabaseUrl();
  if (!url) {
    console.error("DATABASE_URL is not set. Seed requires a Postgres database.");
    process.exit(1);
  }

  const db = createDb(url);
  await seedDatabase(db);

  const emailCount = await db.select({ c: s.emails.emailId }).from(s.emails);
  const orderCount = await db.select({ c: s.salesOrders.soNumber }).from(s.salesOrders);
  console.log(`Seed complete. emails=${emailCount.length} orders=${orderCount.length}`);
  console.log("Run `npm run process` (with DATABASE_URL) to persist classifications, drafts and audit rows.");
  process.exit(0);
}

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
