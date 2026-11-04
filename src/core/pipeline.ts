import type {
  CheckIssue,
  DateString,
  Email,
  ErpSnapshot,
  OrderLineProposal,
  ProcessingResult,
  DraftOrderProposal,
} from "./types.js";
import { parseEmail, extractRequestedDate, type ParsedItem } from "./email-parser.js";
import { matchProduct, resolveSku } from "./product-matching.js";
import { resolveUnitPrice, checkPriceClaims } from "./pricing.js";
import { checkCredit } from "./credit.js";
import { checkStock } from "./inventory.js";
import { detectInjection } from "./injection.js";
import { detectDuplicate, extractCustomerPo } from "./duplicate.js";
import { classifyEmail } from "./classification.js";
import { buildDomainMap, resolveCustomer, resolveShipTo } from "./resolution.js";
import { rulesUrgency } from "./urgency.js";

export interface ProcessContext {
  orderDate: DateString;
  poSeen: Map<string, string>;
}

function issue(code: string, message: string, severity: "block" | "warn" = "block"): CheckIssue {
  return { code, severity, message };
}

function groupByLocation(items: ParsedItem[]): { location: string | null; items: ParsedItem[] }[] {
  const groups = new Map<string, ParsedItem[]>();
  for (const it of items) {
    const key = it.location ?? "";
    const list = groups.get(key) ?? [];
    list.push(it);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([location, items]) => ({ location: location || null, items }));
}

interface ResolvedLine {
  line: OrderLineProposal;
  item: ParsedItem;
}

function resolveItem(
  item: ParsedItem,
  snapshot: ErpSnapshot,
  customerId: string,
  orderDate: DateString,
  issues: CheckIssue[],
): ResolvedLine | null {
  let sku: string | null = null;

  if (item.sku) {
    const resolution = resolveSku(item.sku, snapshot.products);
    if (resolution.status === "unknown") {
      issues.push(issue("UNKNOWN_SKU", `SKU ${item.sku} does not exist in the catalog`));
      return null;
    }
    if (resolution.status === "discontinued") {
      issues.push(
        issue(
          "DISCONTINUED",
          `${resolution.product.sku} is discontinued${resolution.replacement ? `; replacement ${resolution.replacement.sku} (${resolution.replacement.name})` : ""}`,
        ),
      );
      return null;
    }
    sku = resolution.product.sku;
  } else {
    const match = matchProduct(item.description, snapshot.products);
    if (match.status === "no_match") {
      issues.push(issue("AMBIGUOUS_PRODUCT", `Could not match product from description "${item.description}"`));
      return null;
    }
    if (match.status === "ambiguous") {
      issues.push(issue("AMBIGUOUS_PRODUCT", `Description "${item.description}" is ambiguous (${match.candidates.join(", ")})`));
      return null;
    }
    sku = match.sku;
  }

  if (item.quantity == null) {
    issues.push(issue("NO_QUANTITY", `No quantity given for ${sku}`));
    return null;
  }
  if (item.quantity <= 0 || !Number.isInteger(item.quantity)) {
    issues.push(issue("INVALID_QUANTITY", `Quantity ${item.quantity} is not a whole number for ${sku}`));
    return null;
  }

  if (item.unit && /^box(es)?$/i.test(item.unit)) {
    const product = snapshot.products.find((p) => p.sku === sku);
    if (product && product.sellUom === "CS") {
      issues.push(issue("AMBIGUOUS_UNIT", `Customer ordered "${item.unit}" but ${sku} is sold by the ${product.sellUom}`));
      return null;
    }
  }

  const product = snapshot.products.find((p) => p.sku === sku);
  const price = resolveUnitPrice(sku, customerId, orderDate, snapshot.prices, snapshot.products);
  if (!price) {
    issues.push(issue("NO_PRICE", `No price for ${sku}`));
    return null;
  }

  const stock = checkStock(sku, item.quantity, snapshot.inventory, snapshot.incoming);
  if (!stock.ok) {
    const arrival = stock.nextArrival ? ` (next arrival ${stock.nextArrival})` : "";
    issues.push(
      issue(
        "INSUFFICIENT_STOCK",
        `${sku}: requested ${item.quantity}, available ${stock.available}${arrival}`,
      ),
    );
    return null;
  }

  return {
    line: {
      lineNo: 0,
      sku,
      description: item.description || product!.name,
      quantity: item.quantity,
      unitPrice: price.unitPrice,
      priceSource: price.source,
      lineTotal: round2(price.unitPrice * item.quantity),
    },
    item,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function processEmail(email: Email, snapshot: ErpSnapshot, ctx: ProcessContext): ProcessingResult {
  const injection = detectInjection(email.body);
  const items = parseEmail(email);
  const domainMap = buildDomainMap(snapshot.contacts);
  const knownDomains = new Set(domainMap.keys());
  const dup = detectDuplicate(email, ctx.poSeen, snapshot.orders);
  const hasItems = items.length > 0;

  const classification = classifyEmail(email, {
    knownDomains,
    isDuplicate: dup.isDuplicate,
    hasItems,
  });

  const issues: CheckIssue[] = [];
  const audit: ProcessingResult["audit"] = [];
  const notes: string[] = [];
  let customerId: string | null = null;
  let customerName: string | null = null;

  const result: ProcessingResult = {
    emailId: email.emailId,
    receivedAt: email.receivedAt,
    fromEmail: email.fromEmail,
    subject: email.subject,
    classification,
    disposition: "ESCALATE",
    customerId: null,
    customerName: null,
    customerFound: false,
    injection,
    drafts: [],
    changeProposal: null,
    issues,
    audit,
    duplicateOfEmailId: dup.duplicateOfEmailId,
    notes,
    urgency: rulesUrgency(email),
  };

  if (classification === "AUTO_REPLY" || classification === "SPAM" || classification === "NOTIFICATION") {
    result.disposition = "IGNORE";
    notes.push(`ignored as ${classification.toLowerCase()}`);
    audit.push({ actor: "agent", action: "ignored", detail: `Classified ${classification}` });
    return result;
  }

  if (classification === "DUPLICATE") {
    result.disposition = "DUPLICATE";
    notes.push(dup.reason ?? "duplicate detected");
    audit.push({ actor: "agent", action: "deduplicated", detail: dup.reason ?? "duplicate" });
    return result;
  }

  if (classification === "QUOTE" || classification === "QUESTION") {
    result.disposition = "ROUTE";
    notes.push(`routed to human: ${classification.toLowerCase()}`);
    audit.push({ actor: "agent", action: "routed", detail: classification });
    return result;
  }

  // Resolve customer for the remaining order-ish classifications.
  const customer = resolveCustomer(email.fromEmail, snapshot.contacts, domainMap);
  result.customerFound = customer.found;
  if (customer.found && customer.customerId) {
    customerId = customer.customerId;
    result.customerId = customer.customerId;
    const cust = snapshot.customers.find((c) => c.customerId === customer.customerId);
    customerName = cust?.name ?? null;
    result.customerName = customerName;
  }

  if (classification === "CANCELLATION") {
    if (!customer.found) {
      issues.push(issue("UNKNOWN_CUSTOMER", "Could not identify the sender as a known customer"));
    } else {
      const po = extractCustomerPo(`${email.subject}\n${email.body}`);
      const order = snapshot.orders.find((o) => o.customerPo.toUpperCase() === po?.toUpperCase());
      result.changeProposal = {
        soNumber: order?.soNumber ?? po ?? "unknown",
        orderStatus: order?.status ?? "unknown",
        kind: "cancel",
        description: `Cancel PO ${po ?? "unknown"}`,
      };
      result.disposition = "PROPOSE_CHANGE";
      notes.push("Cancellation proposed for human approval");
      audit.push({ actor: "agent", action: "proposed_cancellation", detail: `PO ${po}` });
    }
    return result;
  }

  if (classification === "ORDER_CHANGE") {
    if (!customer.found) {
      issues.push(issue("UNKNOWN_CUSTOMER", "Could not identify the sender as a known customer"));
    } else {
      const soMatch = email.body.match(/SO-\d{4,6}/i);
      const order = soMatch ? snapshot.orders.find((o) => o.soNumber.toUpperCase() === soMatch[0].toUpperCase()) : null;
      if (!order) {
        const po = extractCustomerPo(`${email.subject}\n${email.body}`);
        const byPo = snapshot.orders.find((o) => o.customerPo.toUpperCase() === po?.toUpperCase());
        if (byPo) {
          result.changeProposal = {
            soNumber: byPo.soNumber,
            orderStatus: byPo.status,
            kind: "quantity_change",
            description: `Change to ${byPo.soNumber}`,
          };
          result.disposition = byPo.status === "SHIPPED" ? "ESCALATE" : "PROPOSE_CHANGE";
          if (byPo.status === "SHIPPED") {
            issues.push(issue("SHIPPED_ORDER_EDIT", `Order ${byPo.soNumber} is SHIPPED and cannot be edited`));
          }
        } else {
          issues.push(issue("ORDER_NOT_FOUND", "Referenced order could not be found"));
        }
      } else {
        result.changeProposal = {
          soNumber: order.soNumber,
          orderStatus: order.status,
          kind: /take\s+.*\s+back|reduce\s+.*\s+invoice/i.test(email.body) ? "return" : "quantity_change",
          description: `Change to ${order.soNumber}`,
        };
        if (order.status === "SHIPPED") {
          result.disposition = "ESCALATE";
          issues.push(issue("SHIPPED_ORDER_EDIT", `Order ${order.soNumber} is SHIPPED and cannot be edited`));
        } else {
          result.disposition = "PROPOSE_CHANGE";
          notes.push(`Change to OPEN order ${order.soNumber} proposed for human approval`);
          audit.push({ actor: "agent", action: "proposed_change", detail: `Order ${order.soNumber}` });
        }
      }
    }
    return result;
  }

  // classification === "ORDER"
  if (!customer.found || !customerId) {
    issues.push(issue("UNKNOWN_CUSTOMER", "Could not identify the sender as a known customer"));
    result.disposition = "ESCALATE";
    audit.push({ actor: "agent", action: "escalated", detail: "unknown customer" });
    return result;
  }

  if (!customer.knownContact) {
    issues.push(issue("UNKNOWN_CONTACT", `Email ${email.fromEmail} is not a known contact for ${customerName}`));
  }

  if (injection.detected) {
    issues.push(issue("INJECTION", `Prompt-injection attempt detected: ${injection.indicators.join(", ")}`));
    audit.push({
      actor: "agent",
      action: "injection_flagged",
      detail: `Injection attempt stored: "${injection.excerpt ?? ""}"`,
    });
  }

  if (hasItems && !injection.detected) {
    const requestedDate = extractRequestedDate(email.body);
    if (requestedDate && requestedDate < ctx.orderDate) {
      issues.push(issue("DATE_IN_PAST", `Requested date ${requestedDate} is before the order date ${ctx.orderDate}`));
    }

    const resolvedLines: ResolvedLine[] = [];
    for (const item of items) {
      const line = resolveItem(item, snapshot, customerId, ctx.orderDate, issues);
      if (line) resolvedLines.push(line);
    }

    for (const claim of checkPriceClaims(email.body, customerId, ctx.orderDate, snapshot.prices, snapshot.products)) {
      issues.push(claim);
    }

    if (issues.length === 0 && resolvedLines.length > 0) {
      const totalAll = round2(resolvedLines.reduce((sum, rl) => sum + rl.line.lineTotal, 0));
      const cust = snapshot.customers.find((c) => c.customerId === customerId)!;
      const credit = checkCredit(cust, totalAll);
      if (!credit.ok) {
        issues.push(issue(credit.reason === "CREDIT_HOLD" ? "CREDIT_HOLD" : "CREDIT_LIMIT_EXCEEDED",
          credit.reason === "CREDIT_HOLD"
            ? "Customer is on credit hold"
            : `Order value $${totalAll} would push balance to $${credit.projectedBalance}, over limit $${cust.creditLimit}`));
      }
    }

    if (issues.length === 0) {
      const groups = groupByLocation(items);
      for (const group of groups) {
        const shipToId = resolveShipTo(customerId, group.location, email.body, snapshot.shipTos);
        const groupLines = group.items
          .map((it) => resolvedLines.find((rl) => rl.item === it)?.line)
          .filter((l): l is OrderLineProposal => !!l)
          .map((l, idx) => ({ ...l, lineNo: idx + 1 }));
        if (groupLines.length === 0) continue;
        const orderTotal = round2(groupLines.reduce((sum, l) => sum + l.lineTotal, 0));
        const draft: DraftOrderProposal = {
          customerId,
          customerName: customerName ?? "",
          shipToId: shipToId ?? "",
          customerPo: extractCustomerPo(`${email.subject}\n${email.body}`) ?? "",
          requestedDate,
          lines: groupLines,
          orderTotal,
        };
        result.drafts.push(draft);
      }
    }
  } else if (!hasItems) {
    issues.push(issue("NO_LINE_ITEMS", "No order line items detected in the email"));
  }

  if (issues.length > 0) {
    result.disposition = "ESCALATE";
    const hasInjection = issues.some((i) => i.code === "INJECTION");
    if (!hasInjection) {
      notes.push("escalated: " + issues.map((i) => i.code).join(", "));
    } else {
      notes.push("escalated: injection attempt forced to human review");
    }
    audit.push({ actor: "agent", action: "escalated", detail: issues.map((i) => i.code).join(", ") });
    return result;
  }

  result.disposition = "AUTO_DRAFT";
  notes.push("clean order; drafted awaiting release");
  audit.push({ actor: "agent", action: "drafted", detail: `${result.drafts.length} draft order(s) created` });
  return result;
}
