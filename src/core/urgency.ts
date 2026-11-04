import type { Email, Urgency } from "./types.js";

/**
 * Offline fallback only. The live agent reads the whole message and judges the
 * deadline itself; this rule exists so `npm run process -- --dry-run` and the
 * in-memory demo still show something honest when no model is configured.
 */
const SAME_DAY = /\b(today|tonight|this morning|this afternoon|end of day|eod)\b/i;
const PRESSURED =
  /\b(today|tonight|asap|urgent(ly)?|immediately|right away|before (noon|\d{1,2}(:\d{2})?\s?(am|pm))|end of day|eod|this morning|this afternoon|tomorrow)\b/i;
const NOT_A_REQUEST = /auto[- ]?reply|automatic reply|out of office|auto[- ]?response|undeliverable|delivery status notification|read receipt/i;

export function rulesUrgency(email: Email): Urgency {
  if (NOT_A_REQUEST.test(email.subject)) {
    return { level: "none", reason: "automated message, no delivery deadline", source: "rules" };
  }
  const text = `${email.subject}\n${email.body}`;
  if (!PRESSURED.test(text)) {
    return { level: "none", reason: "no delivery deadline in the message", source: "rules" };
  }
  if (SAME_DAY.test(text)) {
    return { level: "today", reason: "customer asks for it today", source: "rules" };
  }
  return { level: "soon", reason: "customer states a near deadline or urgency", source: "rules" };
}
