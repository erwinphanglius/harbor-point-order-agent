import { getRepository } from "@/lib/repo";
import { AuditTrail } from "@/components/audit-trail";
import type { Actor } from "@/repository/types.js";

export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; actor?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const view = sp.view === "activity" ? "activity" : "order";
  const q = (sp.q ?? "").trim();
  const actorFilter = (sp.actor as Actor | undefined) || undefined;

  const repo = getRepository();
  const [audit, inbox] = await Promise.all([repo.listAudit({ actor: actorFilter }), repo.listInbox()]);

  const soByEmail: Record<string, string> = {};
  const subjectByEmail: Record<string, string> = {};
  for (const item of inbox) {
    const so = item.drafts[0]?.soNumber ?? item.result.changeProposal?.soNumber;
    if (so) soByEmail[item.email.emailId] = so;
    subjectByEmail[item.email.emailId] = item.email.subject;
  }

  const needle = q.toLowerCase();
  const rows = needle
    ? audit.filter((r) =>
        [r.detail, r.action, r.emailId ?? "", r.detail.match(/SO-\d{3,}/)?.[0] ?? ""].some((field) =>
          field.toLowerCase().includes(needle),
        ),
      )
    : audit;

  return (
    <div>
      <h1 className="text-xl font-semibold">Audit trail</h1>
      <p className="mb-4 text-sm text-gray-500">
        Append-only, newest first. Every agent action, release, rejection and change is recorded — {rows.length} of {audit.length} events
        {needle ? ` matching “${q}”` : ""}.
      </p>

      <AuditTrail
        rows={rows}
        soByEmail={soByEmail}
        subjectByEmail={subjectByEmail}
        q={q}
        actor={actorFilter ?? ""}
        initialView={view}
      />
    </div>
  );
}
