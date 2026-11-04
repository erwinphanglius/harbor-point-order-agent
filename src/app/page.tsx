import { getRepository } from "@/lib/repo";
import { InboxClient, type InboxRow } from "@/components/inbox-client";
import { RunPanel } from "@/components/run-panel";
import { DispositionLegend } from "@/components/legend";
import { RunResult } from "@/components/run-result";
import { issueLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const repo = getRepository();
  const [items, status, snapshot] = await Promise.all([
    repo.listInbox(),
    repo.getAgentStatus(),
    repo.getSnapshot(),
  ]);

  const rows: InboxRow[] = items.map((item) => {
    const issues = item.result.issues ?? [];
    const why =
      item.result.disposition === "ESCALATE"
        ? issues[0]?.message ?? item.result.notes?.[0] ?? null
        : item.result.disposition === "DUPLICATE"
          ? issues[0]?.message ?? item.result.notes?.find((n) => /duplicate|already seen/i.test(n)) ?? null
          : item.result.changeProposal?.description ?? null;

    return {
    emailId: item.email.emailId,
    receivedAt: item.email.receivedAt,
    fromName: item.email.fromName,
    fromEmail: item.email.fromEmail,
    subject: item.email.subject,
    classification: item.result.classification,
    disposition: item.result.disposition,
    customerName: item.result.customerName,
    amount: item.amount,
    draftCount: item.drafts.length,
    canRelease: item.drafts.some((d) => d.status === "DRAFT"),
    processed: item.processed,
      // The agent judged this from the message when it read it; before that we show nothing.
      urgency:
        item.processed && item.result.disposition !== "IGNORE"
          ? {
              level: item.result.urgency.level,
              reason: item.result.urgency.reason,
              source: item.result.urgency.source,
            }
          : null,
      why: why ? `${issueLabel(item.result.issues[0]?.code ?? "")}: ${why}`.replace(/\s+/g, " ").slice(0, 110) : null,
      soNumbers: [
        ...item.drafts.map((d) => d.soNumber),
        ...(item.result.changeProposal ? [item.result.changeProposal.soNumber] : []),
      ],
      reviewStatus: item.reviewStatus,
      duplicateOf: item.result.duplicateOfEmailId ?? null,
      duplicateOfSo: null,
    };
  });

  // A duplicate points at the email it repeats; show the order instead of the
  // email id wherever that email produced one.
  const soByEmail = new Map<string, string>();
  for (const r of rows) if (r.soNumbers[0]) soByEmail.set(r.emailId, r.soNumbers[0]);
  for (const r of rows) if (r.duplicateOf) r.duplicateOfSo = soByEmail.get(r.duplicateOf) ?? null;

  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">Inbox</h1>
          <p className="text-sm text-gray-500">
            {rows.length} emails on 2 Nov 2026
            {status.remaining > 0 ? ` · ${status.remaining} not processed yet` : ""}
          </p>
        </div>
      </div>

      <RunPanel
        status={status}
        enabled={Boolean(process.env.OPENCODE_GO_API_KEY ?? process.env.OPENROUTER_API_KEY)}
      />

      <div className="mb-4 grid gap-4 md:grid-cols-[2fr_1fr]">
        <DispositionLegend rows={rows} />
        <RunResult rows={rows} status={status} snapshot={snapshot} />
      </div>

      <InboxClient rows={rows} />
    </div>
  );
}
