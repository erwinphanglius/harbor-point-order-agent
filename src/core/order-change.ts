import type { SalesOrder, SalesOrderLine } from "./types.js";

export interface ChangeValidation {
  ok: boolean;
  reason: string | null;
}

/**
 * Enforce the editing rules from the brief:
 *  - SHIPPED orders cannot be edited;
 *  - PARTIALLY_SHIPPED orders can only change the unshipped quantity
 *    (never reduce below the already-shipped quantity);
 *  - OPEN orders can be freely changed.
 */
export function validateQuantityChange(
  order: SalesOrder,
  line: SalesOrderLine,
  newQuantity: number,
): ChangeValidation {
  if (order.status === "SHIPPED") {
    return { ok: false, reason: "SHIPPED_ORDER_EDIT" };
  }
  if (order.status === "PARTIALLY_SHIPPED") {
    if (newQuantity < line.qtyShipped) {
      return { ok: false, reason: "CANNOT_REDUCE_BELOW_SHIPPED" };
    }
    return { ok: true, reason: null };
  }
  return { ok: true, reason: null };
}
