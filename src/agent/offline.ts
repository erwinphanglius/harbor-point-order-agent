import type { Email, ErpSnapshot, ProcessingResult } from "../core/types.js";
import { processEmail } from "../core/pipeline.js";
import { extractCustomerPo } from "../core/duplicate.js";

/**
 * Deterministic offline engine: classifies and drafts every email with NO LLM
 * call. It reuses the exact same pure core rules that the OpenRouter agent's
 * tools call, in a fixed sequence.
 */
export function runOffline(
  emails: Email[],
  snapshot: ErpSnapshot,
  orderDate: string,
): ProcessingResult[] {
  const sorted = [...emails].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  const poSeen = new Map<string, string>();
  const results: ProcessingResult[] = [];

  for (const email of sorted) {
    const result = processEmail(email, snapshot, { orderDate, poSeen });
    results.push(result);
    const po = extractCustomerPo(`${email.subject}\n${email.body}`);
    if (po && !poSeen.has(po)) poSeen.set(po, email.emailId);
  }

  return results;
}
