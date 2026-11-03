import Link from "next/link";
import { getRepository } from "@/lib/repo";
import { clock } from "@/lib/format";
import type { Actor } from "@/repository/types.js";

export const dynamic = "force-dynamic";

const ACTOR_CLASS: Record<Actor, string> = {
  agent: "bg-blue-100 text-blue-800",
  system: "bg-gray-200 text-gray-700",
  human: "bg-emerald-100 text-emerald-800",
};

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

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Audit trail</h1>
      <p className="mb-4 text-sm text-gray-500">Append-only, newest first. Showing the latest 300 events.</p>

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

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-500">
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Detail</th>
            </tr>
          </thead>
          <tbody>
            {audit.map((a) => (
              <tr key={a.id} className="border-b border-gray-100 last:border-0 align-top">
                <td className="px-3 py-2 text-xs text-gray-500">{clock(a.timestamp)}</td>
                <td className="px-3 py-2">
                  {a.emailId ? (
                    <Link href={`/emails/${a.emailId}`} className="text-blue-700 hover:underline">
                      {a.emailId}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${ACTOR_CLASS[a.actor]}`}>{a.actor}</span>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{a.action}</td>
                <td className="px-3 py-2 text-gray-700">{a.detail}</td>
              </tr>
            ))}
            {audit.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                  No audit entries.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
