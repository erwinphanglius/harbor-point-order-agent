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
}

export interface ActionResult {
  ok: boolean;
  reasons: string[];
}

export interface ReleaseEdit {
  lines: { sku: string; quantity: number }[];
  shipToId: string;
  requestedDate: string | null;
}

export interface Repository {
  listInbox(): InboxItem[];
  getEmail(emailId: string): InboxItem | null;
  listAudit(filter?: { emailId?: string; actor?: Actor }): AuditRecord[];
  listShipTos(customerId: string): ShipToOption[];
  release(emailId: string, soNumber: string): ActionResult;
  releaseWithEdits(emailId: string, soNumber: string, edits: ReleaseEdit): ActionResult;
  reject(emailId: string, soNumber: string | null, reason: string): ActionResult;
  markNoAction(emailId: string): ActionResult;
  bulkRelease(emailIds: string[]): { emailId: string; result: ActionResult }[];
  approveChange(emailId: string): ActionResult;
  getSnapshot(): ErpSnapshot;
}
