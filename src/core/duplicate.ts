import type { Email, SalesOrder } from "./types.js";

const PO_RE = /(?:PO[:\s#]*)?((?:HV|BV|SSL|SOP|PSD)(?:-PO)?-\d{3,6})/i;

export function extractCustomerPo(text: string): string | null {
  const m = text.match(PO_RE);
  return m ? m[1].toUpperCase() : null;
}

export interface DuplicateResult {
  isDuplicate: boolean;
  duplicateOfEmailId: string | null;
  reason: string | null;
}

/**
 * Detect resends/duplicates:
 *  - an explicit "resending"/"forwarded" marker, or
 *  - a customer PO that a prior email in this batch already carried.
 */
export function detectDuplicate(
  email: Email,
  poSeen: Map<string, string>,
  _existingOrders: SalesOrder[],
): DuplicateResult {
  const po = extractCustomerPo(`${email.subject}\n${email.body}`);
  const resendMarker = /\b(?:resending|resent|re-?send|forwarded message)\b/i.test(email.body);

  // A cancellation that references an existing PO is not a duplicate order.
  if (/\bcancel/i.test(email.body)) {
    return { isDuplicate: false, duplicateOfEmailId: null, reason: null };
  }

  if (po) {
    if (poSeen.has(po)) {
      return { isDuplicate: true, duplicateOfEmailId: poSeen.get(po) ?? null, reason: `PO ${po} already seen in email ${poSeen.get(po)}` };
    }
    if (resendMarker) {
      return { isDuplicate: true, duplicateOfEmailId: null, reason: `Resent PO ${po} marked as forwarded/resend` };
    }
  }
  return { isDuplicate: false, duplicateOfEmailId: null, reason: null };
}
