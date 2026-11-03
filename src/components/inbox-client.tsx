"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { Disposition } from "@/core/types.js";
import { bulkRelease } from "@/app/actions";
import { fmtMoney } from "@/lib/format";
import { DispositionBadge } from "./badge";

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
}

function senderLabel(r: InboxRow): string {
  if (r.customerName) return r.customerName;
  const domain = r.fromEmail.split("@")[1]?.toLowerCase() ?? "";
  return domain ? `${domain} (unverified)` : "Unknown sender";
}

const FILTERS: { key: string; label: string; disposition?: Disposition }[] = [
  { key: "all", label: "All" },
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && (!r.processed || r.disposition !== filter)) return false;
      if (!q) return true;
      return (
        r.subject.toLowerCase().includes(q) ||
        r.fromName.toLowerCase().includes(q) ||
        r.fromEmail.toLowerCase().includes(q) ||
        r.emailId.toLowerCase().includes(q) ||
        (r.customerName ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) if (r.processed) c[r.disposition] = (c[r.disposition] ?? 0) + 1;
    return c;
  }, [rows]);

  const releasableSelected = filtered.filter((r) => r.canRelease && selected.has(r.emailId));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onBulkRelease() {
    const ids = releasableSelected.map((r) => r.emailId);
    if (ids.length === 0) return;
    startTransition(async () => {
      const res = await bulkRelease(ids);
      setMessage(res.ok ? `Released ${ids.length} order(s).` : `Bulk release refused: ${res.reasons.join("; ")}`);
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
            placeholder="Search sender, subject, customer…"
            className="rounded border border-gray-300 px-3 py-1 text-sm"
          />
          {releasableSelected.length > 0 && (
            <button
              onClick={onBulkRelease}
              disabled={isPending}
              className="rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Release {releasableSelected.length} selected
            </button>
          )}
        </div>
      </div>

      {message && <div className="mb-4 rounded border border-gray-200 bg-white px-4 py-2 text-sm">{message}</div>}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-500">
              <th className="px-3 py-2 w-8"> </th>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Sender</th>
              <th className="px-3 py-2">Subject</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Disposition</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.emailId} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-3 py-2">
                  {r.canRelease && (
                    <input type="checkbox" checked={selected.has(r.emailId)} onChange={() => toggle(r.emailId)} />
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">{r.receivedAt.slice(11, 16)}</td>
                <td className="px-3 py-2">
                  <Link href={`/emails/${r.emailId}`} className="text-blue-700 hover:underline">
                    {r.fromName}
                  </Link>
                  <div className="text-xs text-gray-400">{r.fromEmail}</div>
                </td>
                <td className="px-3 py-2">
                  <Link href={`/emails/${r.emailId}`} className="hover:underline">
                    {r.subject}
                  </Link>
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">{senderLabel(r)}</td>
                <td className="px-3 py-2">
                  {r.processed ? (
                    <DispositionBadge disposition={r.disposition} />
                  ) : (
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Not processed</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">{fmtMoney(r.amount)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
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
