export type DateString = string; // "YYYY-MM-DD"

export interface Customer {
  customerId: string;
  name: string;
  paymentTerms: string;
  creditLimit: number;
  openBalance: number;
  status: "ACTIVE" | "CREDIT_HOLD";
}

export interface CustomerContact {
  customerId: string;
  name: string;
  email: string;
  role: string;
}

export interface ShipToAddress {
  shipToId: string;
  customerId: string;
  name: string;
  address: string;
  isDefault: boolean;
}

export interface Product {
  sku: string;
  name: string;
  category: string;
  sellUom: "CS" | "EA";
  pack: string;
  listPrice: number;
  status: "ACTIVE" | "DISCONTINUED";
  replacedBy: string | null;
}

export interface CustomerPrice {
  customerId: string;
  sku: string;
  unitPrice: number;
  validFrom: DateString;
  validTo: DateString;
}

export interface Inventory {
  sku: string;
  onHand: number;
  allocated: number;
  available: number;
}

export interface IncomingSupply {
  supplierPo: string;
  sku: string;
  qty: number;
  expectedDate: DateString;
}

export interface SalesOrder {
  soNumber: string;
  customerId: string;
  shipToId: string;
  customerPo: string;
  orderDate: DateString;
  requestedDate: DateString;
  status: "OPEN" | "SHIPPED" | "PARTIALLY_SHIPPED";
  draft: boolean;
  createdByAgent: boolean;
  releasedAt: string | null;
}

export interface SalesOrderLine {
  soNumber: string;
  lineNo: number;
  sku: string;
  qtyOrdered: number;
  qtyShipped: number;
  unitPrice: number;
}

export interface Email {
  emailId: string;
  receivedAt: string;
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  body: string;
  attachments: unknown[];
}

export interface ErpSnapshot {
  customers: Customer[];
  contacts: CustomerContact[];
  shipTos: ShipToAddress[];
  products: Product[];
  prices: CustomerPrice[];
  inventory: Inventory[];
  incoming: IncomingSupply[];
  orders: SalesOrder[];
  orderLines: SalesOrderLine[];
}

export type Classification =
  | "ORDER"
  | "ORDER_CHANGE"
  | "CANCELLATION"
  | "QUOTE"
  | "QUESTION"
  | "SPAM"
  | "AUTO_REPLY"
  | "DUPLICATE";

export type Disposition =
  | "AUTO_DRAFT"
  | "ESCALATE"
  | "PROPOSE_CHANGE"
  | "ROUTE"
  | "IGNORE"
  | "DUPLICATE";

export interface OrderLineProposal {
  lineNo: number;
  sku: string;
  description: string;
  quantity: number;
  unitPrice: number;
  priceSource: "contract" | "list" | "claimed";
  lineTotal: number;
}

export interface DraftOrderProposal {
  customerId: string;
  customerName: string;
  shipToId: string;
  customerPo: string;
  requestedDate: string | null;
  lines: OrderLineProposal[];
  orderTotal: number;
}

export interface ChangeProposal {
  soNumber: string;
  orderStatus: string;
  kind: "quantity_change" | "add_line" | "return" | "cancel";
  description: string;
}

export interface CheckIssue {
  code: string;
  severity: "block" | "warn";
  message: string;
}

export interface InjectionReport {
  detected: boolean;
  indicators: string[];
  excerpt: string | null;
}

export interface ProcessingResult {
  emailId: string;
  receivedAt: string;
  fromEmail: string;
  subject: string;
  classification: Classification;
  disposition: Disposition;
  customerId: string | null;
  customerName: string | null;
  customerFound: boolean;
  injection: InjectionReport;
  drafts: DraftOrderProposal[];
  changeProposal: ChangeProposal | null;
  issues: CheckIssue[];
  audit: AuditEntry[];
  duplicateOfEmailId: string | null;
  notes: string[];
}

export interface AuditEntry {
  actor: string;
  action: string;
  detail: string;
}
