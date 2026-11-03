import Link from "next/link";
import { getRepository } from "@/lib/repo";
import { clock } from "@/lib/format";
import type { Actor, AuditRecord } from "@/repository/types.js";

export const dynamic = "force-dynamic";

const ACTOR_CLASS: Record<Actor, string> = {
  agent: "bg-blue-100 text-blue-800",
  system: "bg-gray-200 text-gray-700",
  human: "bg-emerald-100 text-emerald-800",
};

function soOf(row: AuditRecord): string | null {
  return row.detail.match(/SO-\d+/)?.[0] ?? null;
}

function groupByEmail(rows: AuditRecord[]): { key: string; emailId: string | null; rows: AuditRecord[] }[] {
  const groups = new Map<string, AuditRecord[]>();
  for (const row of rows) {
    const key = soOf(row) ?? row.emailId ?? "system";
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.entries()].map(([key, list]) => ({
    key,
    emailId: key === "system" ? null : key,
    rows: list,
  }));
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; actor?: string }>;
}) {
  const sp = await searchParams;
  const emailFilter = sp.email || undefined;
  const actorFilter = (sp.actor as Actor | undefined) || undefined;

  const repo = getRepository();
  const [items, audit] = await Promise.all([
    repo.listEmailOptions(),
    repo.listAudit({ emailId: emailFilter, actor: actorFilter }),
  ]);

  const groups = groupByEmail(audit);
  const isSo = (key: string) => key.startsWith("SO-");

  return (
    <div>
      <h1 className="text-xl font-semibold">Audit trail</h1>
      <p className="mb-4 text-sm text-gray-500">
        Append-only, newest first, grouped by order (SO) where the events mention one, otherwise by email — {audit.length} events in the latest 300.
      </p>

      <form className="mb-4 flex flex-wrap items-center gap-2" method="GET">
        <select name="email" defaultValue={emailFilter ?? ""} className="rounded border border-gray-300 px-2 py-1 text-sm">
          <option value="">All emails</option>
          {items.map((i) => (
            <option key={i.emailId} value={i.emailId}>
              {i.emailId} — {i.subject}
            </option>
          ))}
        </select>
        <select name="actor" defaultValue={actorFilter ?? ""} className="rounded border border-gray-300 px-2 py-1 text-sm">
          <option value="">All actors</option>
          <option value="agent">agent</option>
          <option value="system">system</option>
          <option value="human">human</option>
        </select>
        <button type="submit" className="rounded border border-gray-300 bg-white px-3 py-1 text-sm hover:bg-gray-100">
          Filter
        </button>
        {(emailFilter || actorFilter) && (
          <Link href="/audit" className="text-sm text-blue-700 hover:underline">
            Clear
          </Link>
        )}
      </form>

      <div className="space-y-2">
        {groups.map((g, idx) => {
          const actors = [...new Set(g.rows.map((r) => r.actor))];
          return (
            <details key={g.key} open={idx < 2} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <summary className="flex cursor-pointer select-none items-center gap-3 px-4 py-2.5 text-sm">
                <span className="font-mono text-xs font-medium">{g.emailId ?? "system"}</span>
                {isSo(g.key) && <span className="text-[10px] uppercase text-gray-400">order</span>}
                <span className="text-xs text-gray-500">
                  {g.rows.length} event{g.rows.length > 1 ? "s" : ""}
                </span>
                {[...new Set(g.rows.map((r) => r.emailId).filter(Boolean))].map((id) => (
                  <Link key={id} href={`/emails/${id}`} className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-600 hover:underline">
                    {id}
                  </Link>
                ))}
                <span className="text-xs text-gray-400">latest {clock(g.rows[0].timestamp)}</span>
                <span className="ml-auto flex gap-1">
                  {actors.map((a) => (
                    <span key={a} className={`rounded-full px-2 py-0.5 text-[10px] ${ACTOR_CLASS[a]}`}>
                      {a}
                    </span>
                  ))}
                </span>
                {g.emailId && (
                  <Link href={`/emails/${g.emailId}`} className="text-xs text-blue-700 hover:underline">
                    open
                  </Link>
                )}
              </summary>
              <table className="w-full border-t border-gray-100 text-sm">
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={r.id} className="border-b border-gray-50 align-top last:border-0">
                      <td className="w-16 px-3 py-1.5 text-xs text-gray-400">{clock(r.timestamp)}</td>
                      <td className="w-20 px-2 py-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] ${ACTOR_CLASS[r.actor]}`}>{r.actor}</span>
                      </td>
                      <td className="w-40 px-2 py-1.5 font-mono text-xs text-gray-600">{r.action}</td>
                      <td className="px-3 py-1.5 text-gray-700">{r.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          );
        })}
        {groups.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-400">
            No audit entries yet — run the agent on the inbox.
          </div>
        )}
      </div>
    </div>
  );
}
