import type { CustomerPrice, DateString, Product } from "./types.js";
import { compareDates, isWithinRange } from "./dates.js";

export interface PriceResolution {
  unitPrice: number;
  source: "contract" | "list";
}

export function isContractValid(price: CustomerPrice, orderDate: DateString): boolean {
  return isWithinRange(orderDate, price.validFrom, price.validTo);
}

export function hasExpiredContract(
  sku: string,
  customerId: string,
  orderDate: DateString,
  prices: CustomerPrice[],
): boolean {
  return prices.some(
    (p) =>
      p.customerId === customerId &&
      p.sku === sku &&
      !isContractValid(p, orderDate) &&
      compareDates(orderDate, p.validTo) > 0,
  );
}

export function resolveUnitPrice(
  sku: string,
  customerId: string,
  orderDate: DateString,
  prices: CustomerPrice[],
  products: Product[],
): PriceResolution | null {
  const product = products.find((p) => p.sku === sku);
  if (!product) return null;
  const matches = prices.filter((p) => p.customerId === customerId && p.sku === sku);
  for (const m of matches) {
    if (isContractValid(m, orderDate)) return { unitPrice: m.unitPrice, source: "contract" };
  }
  return { unitPrice: product.listPrice, source: "list" };
}

export interface PriceClaim {
  amount: number;
  unit: string | null;
}

/** Extract any explicit per-case/per-unit price the customer asserts in the email. */
export function extractClaimedPrices(body: string): PriceClaim[] {
  const claims: PriceClaim[] = [];
  const seen = new Set<number>();
  const patterns = [
    /price\s+of\s+\$(\d+(?:\.\d+)?)/gi,
    /\$(\d+(?:\.\d+)?)\s*(?:\/|a |per )\s*(?:case|cs)/gi,
    /at\s+\$(\d+(?:\.\d+)?)\s*(?:a|per)?\s*(?:case|cs)?/gi,
  ];
  for (const pattern of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(body)) !== null) {
      const amount = parseFloat(m[1]);
      if (!seen.has(amount)) {
        seen.add(amount);
        claims.push({ amount, unit: "case" });
      }
    }
  }
  return claims;
}

export interface ClaimCheck {
  ok: boolean;
  resolvedPrice: number | null;
  resolvedSource: string | null;
  issueCode: string | null;
  issueMessage: string;
}

export function checkPriceClaim(
  sku: string,
  customerId: string,
  orderDate: DateString,
  claimedAmount: number,
  prices: CustomerPrice[],
  products: Product[],
): ClaimCheck {
  const resolution = resolveUnitPrice(sku, customerId, orderDate, prices, products);
  if (!resolution) {
    return {
      ok: false,
      resolvedPrice: null,
      resolvedSource: null,
      issueCode: "NO_RECORD_PRICE_CLAIM",
      issueMessage: `Customer claimed $${claimedAmount}/case but product ${sku} has no price record`,
    };
  }
  if (resolution.unitPrice === claimedAmount) {
    return { ok: true, resolvedPrice: resolution.unitPrice, resolvedSource: resolution.source, issueCode: null, issueMessage: "" };
  }
  const expired = hasExpiredContract(sku, customerId, orderDate, prices);
  if (expired) {
    return {
      ok: false,
      resolvedPrice: resolution.unitPrice,
      resolvedSource: resolution.source,
      issueCode: "EXPIRED_CONTRACT_PRICE",
      issueMessage: `Customer claimed $${claimedAmount}/case but contract price is expired; list price $${resolution.unitPrice} applies`,
    };
  }
  return {
    ok: false,
    resolvedPrice: resolution.unitPrice,
    resolvedSource: resolution.source,
    issueCode: "NO_RECORD_PRICE_CLAIM",
    issueMessage: `Customer claimed $${claimedAmount}/case but no record supports it; resolved price is $${resolution.unitPrice}`,
  };
}

export interface ClaimIssue {
  code: "EXPIRED_CONTRACT_PRICE" | "NO_RECORD_PRICE_CLAIM";
  severity: "block";
  message: string;
}

/** Check every price the customer asserts in the email against recorded prices. */
export function checkPriceClaims(
  body: string,
  customerId: string,
  orderDate: DateString,
  prices: CustomerPrice[],
  products: Product[],
): ClaimIssue[] {
  const issues: ClaimIssue[] = [];
  for (const claim of extractClaimedPrices(body)) {
    let expired = false;
    let consistent = false;
    for (const product of products) {
      const contract = prices.find(
        (p) => p.customerId === customerId && p.sku === product.sku && p.unitPrice === claim.amount,
      );
      if (contract) {
        if (isContractValid(contract, orderDate)) consistent = true;
        else expired = true;
      }
      if (product.listPrice === claim.amount) consistent = true;
    }
    if (expired && !consistent) {
      issues.push({
        code: "EXPIRED_CONTRACT_PRICE",
        severity: "block",
        message: `Customer asserted $${claim.amount}/case but the matching contract price has expired`,
      });
    } else if (!consistent) {
      issues.push({
        code: "NO_RECORD_PRICE_CLAIM",
        severity: "block",
        message: `Customer asserted $${claim.amount}/case but there is no price record supporting it`,
      });
    }
  }
  return issues;
}
