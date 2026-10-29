import type { Customer } from "./types.js";

export interface CreditCheck {
  ok: boolean;
  reason: string | null;
  projectedBalance: number;
}

export function checkCredit(customer: Customer, orderValue: number): CreditCheck {
  if (customer.status === "CREDIT_HOLD") {
    return { ok: false, reason: "CREDIT_HOLD", projectedBalance: customer.openBalance };
  }
  const projectedBalance = customer.openBalance + orderValue;
  if (projectedBalance > customer.creditLimit) {
    return {
      ok: false,
      reason: "CREDIT_LIMIT_EXCEEDED",
      projectedBalance,
    };
  }
  return { ok: true, reason: null, projectedBalance };
}
