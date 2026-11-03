import type { CheckIssue, DateString, DraftOrderProposal, ErpSnapshot } from "./types.js";
import { resolveUnitPrice } from "./pricing.js";
import { checkStock } from "./inventory.js";
import { checkCredit } from "./credit.js";
import { validateQuantityChange } from "./order-change.js";

export interface ReleaseValidation {
  ok: boolean;
  issues: CheckIssue[];
  orderValue: number;
}

function issue(code: string, message: string): CheckIssue {
  return { code, severity: "block", message };
}

function samePrice(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.001;
}

/**
 * Re-validate a draft at approval/release time against the *current* snapshot.
 * This is the safety net that catches data changing between when the agent
 * drafted and when a human clicks release: price windows (contract expiry),
 * credit, stock, and requested-date are all re-checked. Returns a refusal with
 * reasons instead of mutating anything when a rule is violated.
 */
export function validateRelease(
  draft: DraftOrderProposal,
  snapshot: ErpSnapshot,
  releaseDate: DateString,
): ReleaseValidation {
  const issues: CheckIssue[] = [];
  let orderValue = 0;

  for (const line of draft.lines) {
    const product = snapshot.products.find((p) => p.sku === line.sku);
    if (!product) {
      issues.push(issue("UNKNOWN_SKU", `${line.sku} no longer exists in the catalog`));
      continue;
    }
    if (product.status === "DISCONTINUED") {
      issues.push(issue("DISCONTINUED", `${line.sku} is now discontinued`));
      continue;
    }

    const price = resolveUnitPrice(line.sku, draft.customerId, releaseDate, snapshot.prices, snapshot.products);
    if (!price) {
      issues.push(issue("NO_PRICE", `No price for ${line.sku}`));
      continue;
    }
    if (!samePrice(price.unitPrice, line.unitPrice)) {
      issues.push(
        issue(
          "PRICE_CHANGED",
          `${line.sku} was $${line.unitPrice} when drafted but is now $${price.unitPrice} (${price.source})`,
        ),
      );
    }
    orderValue += price.unitPrice * line.quantity;

    const stock = checkStock(line.sku, line.quantity, snapshot.inventory, snapshot.incoming);
    if (!stock.ok) {
      issues.push(
        issue("INSUFFICIENT_STOCK", `${line.sku}: requested ${line.quantity}, available ${stock.available}`),
      );
    }
  }

  const customer = snapshot.customers.find((c) => c.customerId === draft.customerId);
  if (!customer) {
    issues.push(issue("UNKNOWN_CUSTOMER", `Customer ${draft.customerId} no longer exists`));
  } else {
    const credit = checkCredit(customer, orderValue);
    if (!credit.ok) {
      if (credit.reason === "CREDIT_HOLD") {
        issues.push(issue("CREDIT_HOLD", "Customer is on credit hold"));
      } else {
        issues.push(
          issue(
            "CREDIT_LIMIT_EXCEEDED",
            `Order value $${orderValue} would push balance over the credit limit`,
          ),
        );
      }
    }
  }

  if (draft.requestedDate && draft.requestedDate < releaseDate) {
    issues.push(issue("DATE_IN_PAST", `Requested date ${draft.requestedDate} is in the past`));
  }

  return { ok: issues.length === 0, issues, orderValue };
}

export interface ChangeApprovalValidation {
  ok: boolean;
  reason: string | null;
}

/**
 * Re-validate that a proposed change can still be applied at approval time:
 * the target order must still exist and still be editable (OPEN or
 * PARTIALLY_SHIPPED, never SHIPPED).
 */
export function validateChangeApproval(
  soNumber: string,
  snapshot: ErpSnapshot,
): ChangeApprovalValidation {
  const order = snapshot.orders.find((o) => o.soNumber === soNumber);
  if (!order) return { ok: false, reason: `Order ${soNumber} no longer exists` };
  if (order.status === "SHIPPED") return { ok: false, reason: `Order ${soNumber} is SHIPPED and cannot be edited` };
  return { ok: true, reason: null };
}

/** Re-validate a quantity change against the target order's line rules. */
export function validateChangeLine(
  soNumber: string,
  lineNo: number,
  newQuantity: number,
  snapshot: ErpSnapshot,
): { ok: boolean; reason: string | null } {
  const order = snapshot.orders.find((o) => o.soNumber === soNumber);
  if (!order) return { ok: false, reason: `Order ${soNumber} no longer exists` };
  const line = snapshot.orderLines.find((l) => l.soNumber === soNumber && l.lineNo === lineNo);
  if (!line) return { ok: false, reason: `Line ${lineNo} not found on ${soNumber}` };
  const v = validateQuantityChange(order, line, newQuantity);
  return { ok: v.ok, reason: v.reason };
}
