import { describe, it, expect } from "vitest";
import { validateQuantityChange } from "../../src/core/order-change.js";
import type { SalesOrder, SalesOrderLine } from "../../src/core/types.js";

const baseOrder: SalesOrder = {
  soNumber: "SO-24052",
  customerId: "C005",
  shipToId: "S006",
  customerPo: "",
  orderDate: "2026-10-27",
  requestedDate: "2026-10-29",
  status: "PARTIALLY_SHIPPED",
  draft: false,
  createdByAgent: false,
  releasedAt: null,
};

const line: SalesOrderLine = { soNumber: "SO-24052", lineNo: 1, sku: "HPS-1305", qtyOrdered: 10, qtyShipped: 6, unitPrice: 58 };

describe("order change rules", () => {
  it("rejects any edit to a SHIPPED order", () => {
    const shipped = { ...baseOrder, status: "SHIPPED" as const };
    expect(validateQuantityChange(shipped, line, 5)).toMatchObject({ ok: false, reason: "SHIPPED_ORDER_EDIT" });
  });

  it("rejects reducing a partially-shipped line below the shipped quantity", () => {
    expect(validateQuantityChange(baseOrder, line, 4)).toMatchObject({ ok: false, reason: "CANNOT_REDUCE_BELOW_SHIPPED" });
  });

  it("allows changing only the unshipped quantity of a partially-shipped line", () => {
    expect(validateQuantityChange(baseOrder, line, 6)).toMatchObject({ ok: true });
    expect(validateQuantityChange(baseOrder, line, 8)).toMatchObject({ ok: true });
  });
});
