import {
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const customers = pgTable("customers", {
  customerId: text("customer_id").primaryKey(),
  name: text("name").notNull(),
  paymentTerms: text("payment_terms"),
  creditLimit: numeric("credit_limit"),
  openBalance: numeric("open_balance"),
  status: text("status").notNull(),
});

export const customerContacts = pgTable("customer_contacts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.customerId),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role"),
});

export const shipToAddresses = pgTable("ship_to_addresses", {
  shipToId: text("ship_to_id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.customerId),
  name: text("name").notNull(),
  address: text("address").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
});

export const products = pgTable("products", {
  sku: text("sku").primaryKey(),
  name: text("name").notNull(),
  category: text("category"),
  sellUom: text("sell_uom"),
  pack: text("pack"),
  listPrice: numeric("list_price"),
  status: text("status").notNull(),
  replacedBy: text("replaced_by"),
});

export const customerPrices = pgTable("customer_prices", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.customerId),
  sku: text("sku").notNull(),
  unitPrice: numeric("unit_price").notNull(),
  validFrom: text("valid_from").notNull(),
  validTo: text("valid_to").notNull(),
});

export const inventory = pgTable("inventory", {
  sku: text("sku").primaryKey(),
  onHand: numeric("on_hand").notNull(),
  allocated: numeric("allocated").notNull(),
  available: numeric("available").notNull(),
});

export const incomingSupply = pgTable("incoming_supply", {
  supplierPo: text("supplier_po").notNull(),
  sku: text("sku").notNull(),
  qty: numeric("qty").notNull(),
  expectedDate: text("expected_date").notNull(),
});

export const salesOrders = pgTable("sales_orders", {
  soNumber: text("so_number").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.customerId),
  shipToId: text("ship_to_id").references(() => shipToAddresses.shipToId),
  customerPo: text("customer_po"),
  orderDate: text("order_date").notNull(),
  requestedDate: text("requested_date"),
  status: text("status").notNull(),
  draft: boolean("draft").notNull().default(true),
  createdByAgent: boolean("created_by_agent").notNull().default(false),
  releasedAt: timestamp("released_at"),
  sourceEmailId: text("source_email_id"),
  rejectedReason: text("rejected_reason"),
});

export const salesOrderLines = pgTable(
  "sales_order_lines",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    soNumber: text("so_number")
      .notNull()
      .references(() => salesOrders.soNumber),
    lineNo: integer("line_no").notNull(),
    sku: text("sku").notNull(),
    description: text("description"),
    qtyOrdered: numeric("qty_ordered").notNull(),
    qtyShipped: numeric("qty_shipped").notNull().default("0"),
    unitPrice: numeric("unit_price"),
    priceSource: text("price_source"),
  },
  (t) => [
    uniqueIndex("sales_order_lines_so_line_idx").on(t.soNumber, t.lineNo),
  ],
);

export const emails = pgTable("emails", {
  emailId: text("email_id").primaryKey(),
  receivedAt: text("received_at").notNull(),
  fromName: text("from_name"),
  fromEmail: text("from_email").notNull(),
  to: text("to"),
  subject: text("subject"),
  body: text("body").notNull(),
  attachments: text("attachments").notNull().default("[]"),
  classification: text("classification"),
  disposition: text("disposition"),
  reviewStatus: text("review_status").notNull().default("pending"),
  customerId: text("customer_id"),
  issuesJson: text("issues_json"),
  notesJson: text("notes_json"),
  changeProposalJson: text("change_proposal_json"),
  duplicateOfEmailId: text("duplicate_of_email_id"),
  rejectReason: text("reject_reason"),
});

export const auditLog = pgTable("audit_log", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  emailId: text("email_id"),
  actor: text("actor").notNull().default("agent"),
  action: text("action").notNull(),
  detail: text("detail").notNull(),
  dedupeKey: text("dedupe_key").unique(),
});

export const reviewItems = pgTable("review_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  emailId: text("email_id").notNull(),
  soNumber: text("so_number"),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("awaiting_release"),
  reason: text("reason"),
});
