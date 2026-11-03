import type { Disposition } from "../core/types.js";

export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function dispositionLabel(d: Disposition): string {
  switch (d) {
    case "AUTO_DRAFT":
      return "Auto-draft";
    case "ESCALATE":
      return "Escalate";
    case "PROPOSE_CHANGE":
      return "Proposal";
    case "ROUTE":
      return "Route";
    case "IGNORE":
      return "Ignore";
    case "DUPLICATE":
      return "Duplicate";
  }
}

export function dispositionBadgeClass(d: Disposition): string {
  switch (d) {
    case "AUTO_DRAFT":
      return "bg-emerald-100 text-emerald-800";
    case "ESCALATE":
      return "bg-amber-100 text-amber-800";
    case "PROPOSE_CHANGE":
      return "bg-blue-100 text-blue-800";
    case "ROUTE":
      return "bg-violet-100 text-violet-800";
    case "IGNORE":
      return "bg-gray-200 text-gray-600";
    case "DUPLICATE":
      return "bg-slate-200 text-slate-600";
  }
}
