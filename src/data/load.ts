import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type {
  Customer,
  CustomerContact,
  CustomerPrice,
  Email,
  ErpSnapshot,
  IncomingSupply,
  Inventory,
  Product,
  SalesOrder,
  SalesOrderLine,
  ShipToAddress,
} from "../core/types.js";

export function parseCsv(text: string): Record<string, string>[] {
  const table: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      table.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    table.push(row);
  }

  const header = table[0].map((h) => h.trim());
  const records: Record<string, string>[] = [];
  for (let i = 1; i < table.length; i++) {
    const cells = table[i];
    if (cells.every((c) => c.trim() === "")) continue;
    const rec: Record<string, string> = {};
    header.forEach((h, idx) => (rec[h] = (cells[idx] ?? "").trim()));
    records.push(rec);
  }
  return records;
}

function num(v: string | undefined): number {
  const n = parseFloat(v ?? "0");
  return Number.isFinite(n) ? n : 0;
}

function loadCsv(name: string): Record<string, string>[] {
  const p = resolve(process.cwd(), "assessment/data-pack/data", name);
  return parseCsv(readFileSync(p, "utf8"));
}

export function dataPackRoot(): string {
  return resolve(process.cwd(), "assessment/data-pack");
}

export function loadSnapshot(): ErpSnapshot {
  const customers: Customer[] = loadCsv("customers.csv").map((r) => ({
    customerId: r.customer_id,
    name: r.name,
    paymentTerms: r.payment_terms,
    creditLimit: num(r.credit_limit),
    openBalance: num(r.open_balance),
    status: r.status as "ACTIVE" | "CREDIT_HOLD",
  }));

  const contacts: CustomerContact[] = loadCsv("customer_contacts.csv").map((r) => ({
    customerId: r.customer_id,
    name: r.name,
    email: r.email,
    role: r.role,
  }));

  const shipTos: ShipToAddress[] = loadCsv("ship_to_addresses.csv").map((r) => ({
    shipToId: r.ship_to_id,
    customerId: r.customer_id,
    name: r.name,
    address: r.address,
    isDefault: r.is_default === "1",
  }));

  const products: Product[] = loadCsv("products.csv").map((r) => ({
    sku: r.sku,
    name: r.name,
    category: r.category,
    sellUom: r.sell_uom as "CS" | "EA",
    pack: r.pack,
    listPrice: num(r.list_price),
    status: r.status as "ACTIVE" | "DISCONTINUED",
    replacedBy: r.replaced_by || null,
  }));

  const prices: CustomerPrice[] = loadCsv("customer_prices.csv").map((r) => ({
    customerId: r.customer_id,
    sku: r.sku,
    unitPrice: num(r.unit_price),
    validFrom: r.valid_from,
    validTo: r.valid_to,
  }));

  const inventory: Inventory[] = loadCsv("inventory.csv").map((r) => ({
    sku: r.sku,
    onHand: num(r.on_hand),
    allocated: num(r.allocated),
    available: num(r.available),
  }));

  const incoming: IncomingSupply[] = loadCsv("incoming_supply.csv").map((r) => ({
    supplierPo: r.supplier_po,
    sku: r.sku,
    qty: num(r.qty),
    expectedDate: r.expected_date,
  }));

  const orders: SalesOrder[] = loadCsv("sales_orders.csv").map((r) => ({
    soNumber: r.so_number,
    customerId: r.customer_id,
    shipToId: r.ship_to_id,
    customerPo: r.customer_po,
    orderDate: r.order_date,
    requestedDate: r.requested_date,
    status: r.status as "OPEN" | "SHIPPED" | "PARTIALLY_SHIPPED",
    draft: false,
    createdByAgent: false,
    releasedAt: null,
  }));

  const orderLines: SalesOrderLine[] = loadCsv("sales_order_lines.csv").map((r) => ({
    soNumber: r.so_number,
    lineNo: num(r.line_no),
    sku: r.sku,
    qtyOrdered: num(r.qty_ordered),
    qtyShipped: num(r.qty_shipped),
    unitPrice: num(r.unit_price),
  }));

  return {
    customers,
    contacts,
    shipTos,
    products,
    prices,
    inventory,
    incoming,
    orders,
    orderLines,
  };
}

export function loadEmails(): Email[] {
  const p = resolve(process.cwd(), "assessment/data-pack", "emails.jsonl");
  const text = readFileSync(p, "utf8");
  return text
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      const raw = JSON.parse(l) as Record<string, unknown>;
      return {
        emailId: raw.email_id as string,
        receivedAt: raw.received_at as string,
        fromName: raw.from_name as string,
        fromEmail: raw.from_email as string,
        to: raw.to as string,
        subject: raw.subject as string,
        body: raw.body as string,
        attachments: (raw.attachments as unknown[]) ?? [],
      };
    });
}

export function hasDataPack(): boolean {
  return existsSync(dataPackRoot());
}
