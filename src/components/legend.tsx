import type { InboxRow } from "./inbox-client";
import type { Disposition } from "@/core/types.js";

const LEGEND: { d: Disposition; label: string; gloss: string }[] = [
  { d: "AUTO_DRAFT", label: "Auto-draft", gloss: "order read and checked, draft ready for a human to release" },
  { d: "PROPOSE_CHANGE", label: "Proposal", gloss: "change to an existing order, needs approval" },
  { d: "ESCALATE", label: "Escalate", gloss: "something is off (stock, credit, price, unknown item), human decides" },
  { d: "ROUTE", label: "Route", gloss: "not an order: question, quote request or complaint" },
  { d: "DUPLICATE", label: "Duplicate", gloss: "same order already in the inbox" },
  { d: "IGNORE", label: "Ignore", gloss: "spam or auto-reply, nothing to do" },
];

export function DispositionLegend({ rows }: { rows: InboxRow[] }) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.processed) continue;
    counts.set(r.disposition, (counts.get(r.disposition) ?? 0) + 1);
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-gray-900">What the labels mean</h2>
      <ul className="space-y-1">
        {LEGEND.map((item) => (
          <li key={item.d} className="flex gap-2 text-xs text-gray-600">
            <span className="w-20 shrink-0 font-medium text-gray-900">{item.label}</span>
            <span className="flex-1">{item.gloss}</span>
            <span className="shrink-0 font-mono text-gray-400">{counts.get(item.d) ?? 0}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
