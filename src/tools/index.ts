import type {
  DateString,
  ErpSnapshot,
  OrderLineProposal,
} from "../core/types.js";
import { buildDomainMap, resolveCustomer, resolveShipTo } from "../core/resolution.js";
import { matchProduct, resolveSku } from "../core/product-matching.js";
import { resolveUnitPrice } from "../core/pricing.js";
import { checkStock } from "../core/inventory.js";
import { checkCredit } from "../core/credit.js";

export interface ToolContext {
  snapshot: ErpSnapshot;
  orderDate: DateString;
  drafts: { soNumber: string; customerId: string; shipToId: string; customerPo: string; lines: OrderLineProposal[] }[];
  escalations: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => unknown;
}

export function createToolContext(snapshot: ErpSnapshot, orderDate: DateString): ToolContext {
  return { snapshot, orderDate, drafts: [], escalations: [] };
}

function customerForEmail(ctx: ToolContext, email: string) {
  const domainMap = buildDomainMap(ctx.snapshot.contacts);
  const resolution = resolveCustomer(email, ctx.snapshot.contacts, domainMap);
  if (!resolution.found || !resolution.customerId) return null;
  return ctx.snapshot.customers.find((c) => c.customerId === resolution.customerId) ?? null;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "lookup_customer",
    description: "Resolve a sender email address to a known customer record.",
    parameters: {
      type: "object",
      properties: { email: { type: "string" } },
      required: ["email"],
    },
    execute: (args, ctx) => {
      const customer = customerForEmail(ctx, args.email as string);
      if (!customer) return { found: false };
      const domainMap = buildDomainMap(ctx.snapshot.contacts);
      const res = resolveCustomer(args.email as string, ctx.snapshot.contacts, domainMap);
      return {
        found: true,
        customerId: customer.customerId,
        name: customer.name,
        status: customer.status,
        creditLimit: customer.creditLimit,
        openBalance: customer.openBalance,
        knownContact: res.knownContact,
      };
    },
  },
  {
    name: "lookup_product",
    description: "Find a product by SKU or by free-text description.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    execute: (args, ctx) => {
      const query = (args.query as string).trim();
      const bySku = resolveSku(query, ctx.snapshot.products);
      if (bySku.status !== "unknown") {
        const p = bySku.product;
        return { sku: p.sku, name: p.name, sellUom: p.sellUom, listPrice: p.listPrice, status: p.status, replacedBy: p.replacedBy };
      }
      const match = matchProduct(query, ctx.snapshot.products);
      if (match.status === "matched") {
        const p = ctx.snapshot.products.find((x) => x.sku === match.sku)!;
        return { sku: p.sku, name: p.name, sellUom: p.sellUom, listPrice: p.listPrice, status: p.status };
      }
      return match;
    },
  },
  {
    name: "get_contract_price",
    description: "Resolve the unit price for a customer+SKU on a given date (contract if valid, else list).",
    parameters: {
      type: "object",
      properties: { customerId: { type: "string" }, sku: { type: "string" }, date: { type: "string" } },
      required: ["customerId", "sku", "date"],
    },
    execute: (args, ctx) =>
      resolveUnitPrice(
        args.sku as string,
        args.customerId as string,
        args.date as string,
        ctx.snapshot.prices,
        ctx.snapshot.products,
      ),
  },
  {
    name: "check_inventory",
    description: "Check available stock for a SKU and quantity.",
    parameters: {
      type: "object",
      properties: { sku: { type: "string" }, quantity: { type: "number" } },
      required: ["sku", "quantity"],
    },
    execute: (args, ctx) =>
      checkStock(args.sku as string, args.quantity as number, ctx.snapshot.inventory, ctx.snapshot.incoming),
  },
  {
    name: "check_credit",
    description: "Check whether a customer can absorb a given order value.",
    parameters: {
      type: "object",
      properties: { customerId: { type: "string" }, orderValue: { type: "number" } },
      required: ["customerId", "orderValue"],
    },
    execute: (args, ctx) => {
      const customer = ctx.snapshot.customers.find((c) => c.customerId === args.customerId);
      if (!customer) return { ok: false, reason: "UNKNOWN_CUSTOMER" };
      return checkCredit(customer, args.orderValue as number);
    },
  },
  {
    name: "create_draft_order",
    description:
      "Create a DRAFT sales order. This allocates NO stock and consumes NO credit; it only stages an order for human release.",
    parameters: {
      type: "object",
      properties: {
        customerId: { type: "string" },
        shipToId: { type: "string" },
        customerPo: { type: "string" },
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: { sku: { type: "string" }, quantity: { type: "number" }, unitPrice: { type: "number" } },
            required: ["sku", "quantity"],
          },
        },
      },
      required: ["customerId", "lines"],
    },
    execute: (args, ctx) => {
      const soNumber = `SO-AGENT-${ctx.drafts.length + 1}`;
      const lines = ((args.lines as { sku: string; quantity: number; unitPrice?: number }[]) ?? []).map(
        (l, i): OrderLineProposal => ({
          lineNo: i + 1,
          sku: l.sku,
          description: "",
          quantity: l.quantity,
          unitPrice: l.unitPrice ?? 0,
          priceSource: "list",
          lineTotal: (l.unitPrice ?? 0) * l.quantity,
        }),
      );
      ctx.drafts.push({
        soNumber,
        customerId: args.customerId as string,
        shipToId: (args.shipToId as string) ?? "",
        customerPo: (args.customerPo as string) ?? "",
        lines,
      });
      return { soNumber, draft: true, lines };
    },
  },
  {
    name: "propose_order_change",
    description: "Propose a change to an existing OPEN order for human approval.",
    parameters: {
      type: "object",
      properties: { soNumber: { type: "string" }, description: { type: "string" } },
      required: ["soNumber", "description"],
    },
    execute: (args) => {
      return { soNumber: args.soNumber, description: args.description, proposed: true, requiresApproval: true };
    },
  },
  {
    name: "flag_for_review",
    description: "Escalate an email to human review; creates no draft.",
    parameters: {
      type: "object",
      properties: { reasons: { type: "array", items: { type: "string" } } },
      required: ["reasons"],
    },
    execute: (args, ctx) => {
      const reasons = (args.reasons as string[]) ?? [];
      ctx.escalations.push(...reasons);
      return { escalated: true, reasons };
    },
  },
];

export function getTool(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.name === name);
}

export function resolveDefaultShipTo(ctx: ToolContext, customerId: string, text: string): string | null {
  return resolveShipTo(customerId, null, text, ctx.snapshot.shipTos);
}
