import type { Email, ErpSnapshot, OrderLineProposal, ProcessingResult } from "../core/types.js";

export type Actor = "agent" | "system" | "human";

export interface AuditRecord {
  id: number;
  timestamp: string;
  emailId: string | null;
  actor: Actor;
  action: string;
  detail: string;
}

export type DraftStatus = "DRAFT" | "RELEASED" | "REJECTED";

export interface DraftState {
  soNumber: string;
  emailId: string;
  customerId: string;
  customerName: string;
  shipToId: string;
  customerPo: string;
  requestedDate: string | null;
  lines: OrderLineProposal[];
  orderTotal: number;
  status: DraftStatus;
  releasedAt: string | null;
  rejectReason: string | null;
}

export interface ShipToOption {
  shipToId: string;
  name: string;
  address: string;
  isDefault: boolean;
}

export interface InboxItem {
  email: Email;
  result: ProcessingResult;
  drafts: DraftState[];
  amount: number | null;
  emailState: "pending" | "no_action";
  emailRejectReason: string | null;
  processed: boolean;
  /** pending | released | rejected | approved | no_action */
  reviewStatus: string;
}

export interface AgentRunUsage {
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export interface AgentStatus {
  model: string;
  total: number;
  processed: number;
  remaining: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  runs: number;
  lastRunAt: string | null;
}

export interface DashboardInventory {
  sku: string;
  name: string;
  listPrice: number;
  onHand: number;
  allocated: number;
  available: number;
  status: string;
}

export interface DashboardCustomer {
  customerId: string;
  name: string;
  creditLimit: number;
  openBalance: number;
  headroom: number;
  status: string;
}

export interface DashboardOrder {
  soNumber: string;
  customerName: string;
  status: string;
  total: number;
  releasedAt: string | null;
}

export interface Dashboard {
  inventory: DashboardInventory[];
  customers: DashboardCustomer[];
  orders: DashboardOrder[];
  totals: {
    products: number;
    lowStock: number;
    creditLimit: number;
    creditUsed: number;
    openOrders: number;
    released: number;
  };
}

export interface ActionResult {
  ok: boolean;
  reasons: string[];
  /** What the action actually changed, for the confirmation banner. */
  detail?: string;
}

export interface ReleaseEdit {
  lines: { sku: string; quantity: number }[];
  shipToId: string;
  requestedDate: string | null;
}

export interface Repository {
  /** Run the agent over the inbox and persist the result idempotently. */
  processInbox(): Promise<ProcessingResult[]>;
  /** Emails the agent has not looked at yet, oldest first. */
  listUnprocessed(limit: number): Promise<Email[]>;
  /** Persist one agent batch and record its token/cost usage. */
  saveAgentResults(results: ProcessingResult[], usage: AgentRunUsage, model: string): Promise<void>;
  getAgentStatus(): Promise<AgentStatus>;
  /** Wipe every derived row and re-seed the raw inbox (demo reset). */
  resetDemo(): Promise<void>;
  listInbox(): Promise<InboxItem[]>;
  getEmail(emailId: string): Promise<InboxItem | null>;
  listAudit(filter?: { emailId?: string; actor?: Actor }): Promise<AuditRecord[]>;
  /** Just the id and subject of each email, for filter dropdowns. */
  listEmailOptions(): Promise<{ emailId: string; subject: string }[]>;
  listShipTos(customerId: string): Promise<ShipToOption[]>;
  release(emailId: string, soNumber: string): Promise<ActionResult>;
  releaseWithEdits(emailId: string, soNumber: string, edits: ReleaseEdit): Promise<ActionResult>;
  reject(emailId: string, soNumber: string | null, reason: string): Promise<ActionResult>;
  markNoAction(emailId: string): Promise<ActionResult>;
  bulkRelease(emailIds: string[]): Promise<{ emailId: string; result: ActionResult }[]>;
  approveChange(emailId: string): Promise<ActionResult>;
  getSnapshot(): Promise<ErpSnapshot>;
  /** Read-only ERP view: stock, credit and orders after human decisions. */
  getDashboard(): Promise<Dashboard>;
}
