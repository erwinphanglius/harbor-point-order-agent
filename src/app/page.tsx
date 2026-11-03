import { getRepository } from "@/lib/repo";
import { InboxClient, type InboxRow } from "@/components/inbox-client";
import { RunPanel } from "@/components/run-panel";
import { DispositionLegend } from "@/components/legend";
import { SnapshotCard } from "@/components/snapshot-card";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const repo = getRepository();
  const [items, status, snapshot] = await Promise.all([
    repo.listInbox(),
    repo.getAgentStatus(),
    repo.getSnapshot(),
  ]);

  const rows: InboxRow[] = items.map((item) => ({
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
  }));

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
        <SnapshotCard snapshot={snapshot} />
      </div>

      <InboxClient rows={rows} />
    </div>
  );
}
