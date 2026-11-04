import type { Disposition } from "../core/types.js";

export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Wall-clock time as stored, e.g. "2026-11-02T07:14:00-05:00" -> "07:14". */
export function clock(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = iso.match(/T(\d{2}:\d{2})/);
  if (m) return m[1];
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(11, 16);
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

export function reviewStatusLabel(s: string): string {
  switch (s) {
    case "released":
      return "Released";
    case "rejected":
      return "Rejected";
    case "approved":
      return "Change approved";
    case "no_action":
      return "No action needed";
    default:
      return s.replace("_", " ");
  }
}

export function reviewStatusClass(s: string): string {
  switch (s) {
    case "released":
      return "bg-emerald-100 text-emerald-800";
    case "rejected":
      return "bg-red-100 text-red-800";
    case "approved":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-gray-100 text-gray-600";
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
