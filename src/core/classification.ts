import type { Classification, Email } from "./types.js";
import { extractCustomerPo } from "./duplicate.js";

const SO_RE = /\bSO-\d{4,6}\b/i;

const SPAM_MARKERS = [
  /page\s*1\s*of\s*google/i,
  /\bseo\b/i,
  /free\s*audit/i,
  /business\s*owner/i,
  /rankboost/i,
  /proven\s+.*packages/i,
];

export function isAutoReply(email: Email): boolean {
  return /automatic\s*reply/i.test(email.subject) || /out\s+of\s+the\s+office/i.test(email.body);
}

export function isSpam(email: Email, knownDomains: Set<string>): boolean {
  const domain = email.fromEmail.split("@")[1]?.toLowerCase() ?? "";
  if (knownDomains.has(domain)) return false;
  const text = `${email.subject}\n${email.body}`;
  return SPAM_MARKERS.some((re) => re.test(text));
}

export function classifyEmail(
  email: Email,
  ctx: { knownDomains: Set<string>; isDuplicate: boolean; hasItems: boolean },
): Classification {
  if (isAutoReply(email)) return "AUTO_REPLY";
  if (isSpam(email, ctx.knownDomains)) return "SPAM";
  if (ctx.isDuplicate) return "DUPLICATE";

  const text = `${email.subject}\n${email.body}`;

  if (/\bcancel/i.test(text) && extractCustomerPo(text)) return "CANCELLATION";

  if (/\bquote\b/i.test(text) && /\bnot\s+ordering|comparing\s+suppliers|next\s+month\b/i.test(text)) {
    return "QUOTE";
  }

  const changeIntent =
    /\b(?:change|instead|add|update|make\s+it|take\s+.*\s+back|reduce\s+.*\s+invoice)\b/i.test(text);
  if (changeIntent && (SO_RE.test(text) || /\border\b|\bpo\b/i.test(text))) {
    return "ORDER_CHANGE";
  }

  if (
    /\binvoice\s+question\b/i.test(text) ||
    /\bwhy\s+is\s+my\b/i.test(text) ||
    /\bnever\s+came\b/i.test(text) ||
    /\bcan\s+you\s+check\b/i.test(text)
  ) {
    return "QUESTION";
  }

  if (ctx.hasItems || extractCustomerPo(text)) return "ORDER";
  return "ORDER";
}
