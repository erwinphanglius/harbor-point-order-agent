import type { InjectionReport } from "./types.js";

const INDICATORS: { re: RegExp; label: string }[] = [
  { re: /skip\s*human\s*review/i, label: "skip_human_review" },
  { re: /automated\s+order\s+system/i, label: "addresses_automation" },
  { re: /ignore\s+(?:all|previous|prior|the above|any)\s+instructions/i, label: "ignore_instructions" },
  { re: /(?:apply|give)\s+(?:the\s+)?(?:a\s+)?discount/i, label: "discount_instruction" },
  { re: /pre-?approved\s+by\s+management/i, label: "pre_approved" },
  { re: /override\s+(?:the\s+)?(?:system|approval|review)/i, label: "override" },
  { re: /do\s+not\s+(?:escalate|review|check)/i, label: "suppress_review" },
  { re: /bypass\s+(?:the\s+)?(?:approval|review|check)/i, label: "bypass" },
];

export function detectInjection(body: string): InjectionReport {
  const indicators: string[] = [];
  let firstIndex: number | null = null;
  for (const { re, label } of INDICATORS) {
    const m = body.match(re);
    if (m && m.index != null) {
      indicators.push(label);
      if (firstIndex === null || m.index < firstIndex) firstIndex = m.index;
    }
  }

  if (indicators.length === 0) {
    return { detected: false, indicators: [], excerpt: null };
  }

  const start = Math.max(0, (firstIndex ?? 0) - 40);
  const end = Math.min(body.length, (firstIndex ?? 0) + 120);
  return {
    detected: true,
    indicators,
    excerpt: body.slice(start, end).replace(/\s+/g, " ").trim(),
  };
}
