"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { clock } from "@/lib/format";
import type { Actor, AuditRecord } from "@/repository/types.js";

const ACTOR_CLASS: Record<Actor, string> = {
  agent: "bg-blue-100 text-blue-800",
  system: "bg-gray-200 text-gray-700",
  human: "bg-emerald-100 text-emerald-800",
};

function soOf(row: AuditRecord): string | null {
  return row.detail.match(/SO-\d{3,}/)?.[0] ?? null;
}

type Group = { key: string; so: string | null; emailId: string | null; rows: AuditRecord[] };

/**
 * One group per order. Older events only name the email, so fall back to the
 * order that email produced; anything with neither stays with its email.
 */
function groupBySo(rows: AuditRecord[], soByEmail: Map<string, string>): Group[] {
  const groups = new Map<string, AuditRecord[]>();
  for (const row of rows) {
    const so = soOf(row) ?? (row.emailId ? soByEmail.get(row.emailId) ?? null : null);
    const key = so ? `so:${so}` : row.emailId ? `email:${row.emailId}` : "system";
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }
  const rank = (g: Group) => (g.so ? 0 : g.emailId ? 1 : 2);
  return [...groups.entries()]
    .map(([key, list]) => {
      const so = key.startsWith("so:") ? key.slice(3) : null;
      const emailId = key.startsWith("email:") ? key.slice(6) : null;
      return { key, so, emailId, rows: [...list].sort((a, b) => b.timestamp.localeCompare(a.timestamp)) };
    })
    .sort((a, b) => rank(a) - rank(b) || b.rows[0].timestamp.localeCompare(a.rows[0].timestamp));
}

const LINKABLE = /(\bSO-\d{3,}\b|\bE\d{3}\b)/g;

/** Details are plain text; turn the order and email ids in them into links. */
function LinkedText({ text }: { text: string }) {
  return (
    <>
      {text.split(LINKABLE).map((part, i) => {
        if (/^SO-\d{3,}$/.test(part)) {
          return (
            <Link key={i} href={`/so/${part}`} className="font-medium text-blue-700 hover:underline">
              {part}
            </Link>
          );
        }
        if (/^E\d{3}$/.test(part)) {
          return (
            <Link key={i} href={`/emails/${part}`} className="underline">
              {part}
            </Link>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function EventRow({ row }: { row: AuditRecord }) {
  return (
    <tr className="border-b border-gray-50 align-top last:border-0">
      <td className="w-16 px-3 py-1.5 text-xs text-gray-400">{clock(row.timestamp)}</td>
      <td className="w-20 px-2 py-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[10px] ${ACTOR_CLASS[row.actor]}`}>{row.actor}</span>
      </td>
      <td className="w-40 px-2 py-1.5 font-mono text-xs text-gray-600">{row.action}</td>
      <td className="px-3 py-1.5 text-gray-700">
        <LinkedText text={row.detail} />
      </td>
      <td className="w-32 px-3 py-1.5 text-right">
        {row.emailId && (
          <Link href={`/emails/${row.emailId}`} className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-600 hover:underline">
            {row.emailId}
          </Link>
        )}
      </td>
    </tr>
  );
}

/**
 * Both views are the same rows in a different cut, so switching is local state:
 * no navigation, no server round-trip, no waiting. The URL still follows along
 * so a tab can be linked to.
 */
export function AuditTrail({
  rows,
  soByEmail,
  subjectByEmail,
  q,
  actor,
  initialView,
}: {
  rows: AuditRecord[];
  soByEmail: Record<string, string>;
  subjectByEmail: Record<string, string>;
  q: string;
  actor: Actor | "";
  initialView: "order" | "activity";
}) {
  const [view, setView] = useState<"order" | "activity">(initialView);
  const groups = useMemo(() => groupBySo(rows, new Map(Object.entries(soByEmail))), [rows, soByEmail]);
  const subjects = useMemo(() => new Map(Object.entries(subjectByEmail)), [subjectByEmail]);
  const needle = q.length > 0;

  function pick(next: "order" | "activity") {
    setView(next);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (actor) params.set("actor", actor);
    params.set("view", next);
    window.history.replaceState(null, "", `/audit?${params.toString()}`);
  }

  const tabs: { key: "order" | "activity"; label: string; count: number }[] = [
    { key: "order", label: "By order (SO)", count: groups.length },
    { key: "activity", label: "All activity", count: rows.length },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex overflow-hidden rounded border border-gray-300">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={view === t.key}
              onClick={() => pick(t.key)}
              className={`px-3 py-1 text-sm ${view === t.key ? "bg-gray-900 text-white" : "bg-white text-gray-700 hover:bg-gray-100"}`}
            >
              {t.label} <span className={view === t.key ? "text-gray-300" : "text-gray-400"}>{t.count}</span>
            </button>
          ))}
        </div>

        <form className="flex flex-wrap items-center gap-2" method="GET" action="/audit">
          <input type="hidden" name="view" value={view} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search SO, email, action or text…"
            className="w-64 rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <select name="actor" defaultValue={actor} className="rounded border border-gray-300 px-2 py-1 text-sm">
            <option value="">All actors</option>
            <option value="agent">agent</option>
            <option value="system">system</option>
            <option value="human">human</option>
          </select>
          <button type="submit" className="rounded border border-gray-300 bg-white px-3 py-1 text-sm hover:bg-gray-100">
            Search
          </button>
          {(q || actor) && (
            <Link href={{ pathname: "/audit", query: { view } }} className="text-sm text-blue-700 hover:underline">
              Clear
            </Link>
          )}
        </form>
      </div>

      {view === "order" ? (
      <div className="space-y-2">
        {groups.map((g, idx) => {
          const actors = [...new Set(g.rows.map((r) => r.actor))];
          const emailIds = [...new Set(g.rows.map((r) => r.emailId).filter(Boolean))] as string[];
          const label = g.so ?? g.emailId ?? "system";
          return (
            <details key={g.key} open={idx < 2} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <summary className="flex cursor-pointer select-none items-center gap-3 px-4 py-2.5 text-sm">
                {g.so ? (
                  <Link href={`/so/${g.so}`} className="font-mono text-xs font-semibold text-blue-700 hover:underline">
                    {g.so}
                  </Link>
                ) : (
                  <span className="max-w-md truncate text-xs font-medium text-gray-700">
                    {g.emailId ? subjects.get(g.emailId) ?? g.emailId : label}
                  </span>
                )}
                {!g.so && g.emailId && <span className="text-[10px] uppercase text-gray-400">email · no order</span>}
                {!g.so && !g.emailId && <span className="text-[10px] uppercase text-gray-400">system</span>}
                <span className="text-xs text-gray-500">
                  {g.rows.length} event{g.rows.length > 1 ? "s" : ""}
                </span>
                <span className="text-xs text-gray-400">latest {clock(g.rows[0].timestamp)}</span>
                <span className="ml-auto flex items-center gap-1">
                  {actors.map((a) => (
                    <span key={a} className={`rounded-full px-2 py-0.5 text-[10px] ${ACTOR_CLASS[a]}`}>
                      {a}
                    </span>
                  ))}
                  {emailIds.map((id) => (
                    <Link key={id} href={`/emails/${id}`} className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-600 hover:underline">
                      {id}
                    </Link>
                  ))}
                </span>
              </summary>
              <table className="w-full border-t border-gray-100 text-sm">
                <tbody>
                  {g.rows.map((r) => (
                    <EventRow key={r.id} row={r} />
                  ))}
                </tbody>
              </table>
            </details>
          );
        })}
        {groups.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-400">
            {needle ? "No events match that search." : "No audit entries yet — run the agent on the inbox."}
          </div>
        )}
      </div>

      ) : (
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-500">
              <th className="px-3 py-2">Time</th>
              <th className="px-2 py-2">Actor</th>
              <th className="px-2 py-2">Action</th>
              <th className="px-3 py-2">Detail</th>
              <th className="px-3 py-2 text-right">Email</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <EventRow key={r.id} row={r} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-400">
                  {needle ? "No events match that search." : "No audit entries yet — run the agent on the inbox."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}
    </>
  );
}
