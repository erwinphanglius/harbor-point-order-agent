const LABELS: Record<string, string> = {
  INSUFFICIENT_STOCK: "Stock short",
  DISCONTINUED: "Discontinued item",
  UNKNOWN_SKU: "Unknown item",
  UNKNOWN_CUSTOMER: "Unknown customer",
  EXPIRED_CONTRACT_PRICE: "Contract price expired",
  NO_RECORD_PRICE_CLAIM: "Price not on record",
  NO_PRICE: "No price on file",
  PRICE_CHANGED: "Price changed",
  NO_LINE_ITEMS: "No items in the request",
  AMBIGUOUS_QUANTITY: "Quantity unclear",
  PROMPT_INJECTION: "Suspicious instruction",
  AGENT_FLAG: "Needs a human",
  AGENT_NO_DECISION: "Agent gave no verdict",
  AGENT_UNPARSEABLE: "Agent output unreadable",
  ORDER_NOT_FOUND: "Reference not recognised",
  SHIPPED_ORDER_EDIT: "Order already shipped",
  CREDIT_LIMIT: "Over credit limit",
  PAST_DATE: "Delivery date has passed",
};

export function issueLabel(code: string): string {
  if (LABELS[code]) return LABELS[code];
  return code
    .toLowerCase()
    .split("_")
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}
