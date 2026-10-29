import { getRepository } from "@/lib/repo";
import { InboxClient, type InboxRow } from "@/components/inbox-client";

export const dynamic = "force-dynamic";

export default function InboxPage() {
  const repo = getRepository();
  const items = repo.listInbox();

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
  }));

  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">Inbox</h1>
          <p className="text-sm text-gray-500">{rows.length} emails on 2 Nov 2026</p>
        </div>
      </div>
      <InboxClient rows={rows} />
    </div>
  );
}
