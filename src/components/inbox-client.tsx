"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { Disposition } from "@/core/types.js";
import { bulkRelease, rejectOrder } from "@/app/actions";
import { fmtMoney, reviewStatusClass, reviewStatusLabel } from "@/lib/format";
import { DispositionBadge } from "./badge";
import { Spinner } from "./ui";

export interface InboxRow {
  emailId: string;
  receivedAt: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  classification: string;
  disposition: Disposition;
  customerName: string | null;
  amount: number | null;
  draftCount: number;
  canRelease: boolean;
  processed: boolean;
  urgency: "today" | "urgent" | null;
  why: string | null;
  soNumbers: string[];
  reviewStatus: string;
  duplicateOf: string | null;
  duplicateOfSo: string | null;
}

function senderLabel(r: InboxRow): string {
  if (r.customerName) return r.customerName;
  const domain = r.fromEmail.split("@")[1]?.toLowerCase() ?? "";
  return domain ? `${domain} (unverified)` : "Unknown sender";
}

const FILTERS: { key: string; label: string; disposition?: Disposition }[] = [
  { key: "all", label: "All" },
  { key: "urgent", label: "Urgent" },
  { key: "AUTO_DRAFT", label: "Auto-draft", disposition: "AUTO_DRAFT" },
  { key: "PROPOSE_CHANGE", label: "Proposal", disposition: "PROPOSE_CHANGE" },
  { key: "ESCALATE", label: "Escalate", disposition: "ESCALATE" },
  { key: "ROUTE", label: "Route", disposition: "ROUTE" },
  { key: "DUPLICATE", label: "Duplicate", disposition: "DUPLICATE" },
  { key: "IGNORE", label: "Ignore", disposition: "IGNORE" },
];

export function InboxClient({ rows }: { rows: InboxRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, urgent: rows.filter((r) => r.urgency).length };
    for (const r of rows) if (r.processed) c[r.disposition] = (c[r.disposition] ?? 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (filter === "urgent") {
        if (!r.urgency) return false;
      } else if (filter !== "all" && (!r.processed || r.disposition !== filter)) {
        return false;
      }
      if (!q) return true;
      return (
        r.subject.toLowerCase().includes(q) ||
        r.fromName.toLowerCase().includes(q) ||
        r.fromEmail.toLowerCase().includes(q) ||
        r.emailId.toLowerCase().includes(q) ||
        r.soNumbers.some((so) => so.toLowerCase().includes(q)) ||
        (r.customerName ?? "").toLowerCase().includes(q)
      );
    });
    // Same-day promises first, then newest.
    return [...list].sort((a, b) => {
      const rank = (r: InboxRow) => (r.urgency === "today" ? 0 : r.urgency === "urgent" ? 1 : 2);
      const byRank = rank(a) - rank(b);
      return byRank !== 0 ? byRank : b.receivedAt.localeCompare(a.receivedAt);
    });
  }, [rows, query, filter]);

  const releasableSelected = filtered.filter((r) => r.canRelease && selected.has(r.emailId));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function quickReject(r: InboxRow) {
    const reason = window.prompt(`Reject ${r.emailId}${r.soNumbers[0] ? ` (${r.soNumbers[0]})` : ""} — reason for the audit trail:`);
    if (!reason?.trim()) return;
    startTransition(async () => {
      const res = await rejectOrder(r.emailId, r.soNumbers[0] ?? null, reason.trim());
      setMessage(res.ok ? res.detail ?? "Rejected." : `Rejected refused: ${res.reasons.join("; ")}`);
    });
  }

  function onBulkRelease() {
    const ids = releasableSelected.map((r) => r.emailId);
    if (ids.length === 0) return;
    startTransition(async () => {
      const res = await bulkRelease(ids);
      setMessage(res.ok ? `Released ${ids.length} order(s). Stock allocated and credit consumed — see the dashboard.` : `Bulk release refused: ${res.reasons.join("; ")}`);
      setSelected(new Set());
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              filter === f.key ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            {f.label} <span className="opacity-70">{counts[f.key] ?? 0}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sender, subject, SO, customer…"
            className="rounded border border-gray-300 px-3 py-1 text-sm"
          />
          {releasableSelected.length > 0 && (
            <button
              onClick={onBulkRelease}
              disabled={isPending}
              className="flex items-center gap-2 rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {isPending && <Spinner className="h-3.5 w-3.5" />}
              {isPending ? "Releasing…" : `Release ${releasableSelected.length} selected`}
            </button>
          )}
        </div>
      </div>

      {message && <div className="mb-4 rounded border border-gray-200 bg-white px-4 py-2 text-sm">{message}</div>}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-500">
              <th className="w-8 px-3 py-2"> </th>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Sender</th>
              <th className="px-3 py-2">Subject</th>
              <th className="px-3 py-2">Order (SO)</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Disposition</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.emailId} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-3 py-2 align-top">
                  {r.canRelease && (
                    <input type="checkbox" checked={selected.has(r.emailId)} onChange={() => toggle(r.emailId)} />
                  )}
                </td>
                <td className="px-3 py-2 align-top text-xs text-gray-500">{r.receivedAt.slice(11, 16)}</td>
                <td className="px-3 py-2 align-top">
                  <Link href={`/emails/${r.emailId}`} className="text-blue-700 hover:underline">
                    {r.fromName}
                  </Link>
                  <div className="text-xs text-gray-400">{r.fromEmail}</div>
                </td>
                <td className="px-3 py-2 align-top">
                  <Link href={`/emails/${r.emailId}`} className="hover:underline">
                    {r.subject}
                  </Link>
                  {r.duplicateOf && (
                    <div className="mt-0.5 text-[11px]">
                      <Link
                        href={r.duplicateOfSo ? `/so/${r.duplicateOfSo}` : `/emails/${r.duplicateOf}`}
                        className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-800 hover:underline"
                      >
                        duplicate of {r.duplicateOfSo ?? r.duplicateOf}
                      </Link>
                    </div>
                  )}
                  {r.why && r.processed && (
                    <div className="mt-0.5 line-clamp-1 text-xs text-gray-500" title={r.why}>
                      {r.why}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  {r.soNumbers.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {r.soNumbers.map((so) => (
                        <Link
                          key={so}
                          href={`/so/${so}`}
                          className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-700 hover:bg-gray-200 hover:underline"
                        >
                          {so}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400" title="This email does not create or change an order">
                      —
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 align-top text-xs text-gray-600">{senderLabel(r)}</td>
                <td className="px-3 py-2 align-top">
                  {r.processed ? (
                    <>
                      <DispositionBadge disposition={r.disposition} />
                      {r.reviewStatus !== "pending" && (
                        <div className="mt-1">
                          <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${reviewStatusClass(r.reviewStatus)}`}>
                            {reviewStatusLabel(r.reviewStatus)}
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Not processed</span>
                  )}
                </td>
                <td className="px-3 py-2 align-top text-right">
                  <div>{fmtMoney(r.amount)}</div>
                  {r.processed && r.reviewStatus !== "released" && r.reviewStatus !== "rejected" && (
                    <button
                      onClick={() => quickReject(r)}
                      disabled={isPending}
                      className="mt-1 text-[11px] text-gray-400 underline hover:text-red-600 disabled:opacity-50"
                    >
                      reject
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-gray-400">
                  No emails match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
