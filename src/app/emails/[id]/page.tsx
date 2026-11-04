import { notFound } from "next/navigation";
import Link from "next/link";
import { getRepository } from "@/lib/repo";
import { buildTrace } from "@/lib/trace";
import { EmailDetailClient } from "@/components/email-detail-client";

export const dynamic = "force-dynamic";

export default async function EmailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = getRepository();
  const item = await repo.getEmail(id);
  if (!item) notFound();

  const snapshot = await repo.getSnapshot();
  const trace = buildTrace(item.result, snapshot);
  const shipTos = item.result.customerId ? await repo.listShipTos(item.result.customerId) : [];

  // A duplicate points at another email; link to that email's order when it has one.
  const duplicate = item.result.duplicateOfEmailId ? await repo.getEmail(item.result.duplicateOfEmailId) : null;
  const duplicateOfSo = duplicate?.drafts[0]?.soNumber ?? duplicate?.result.changeProposal?.soNumber ?? null;

  return (
    <div>
      <div className="mb-4">
        <Link href="/" className="text-sm text-blue-700 hover:underline">
          ← Inbox
        </Link>
      </div>
      {!item.processed ? (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          The agent has not read this email yet. Press <strong>Run agent</strong> on the{" "}
          <Link href="/" className="underline">
            inbox
          </Link>{" "}
          to get a verdict.
        </div>
      ) : null}
      <EmailDetailClient
        email={{
          emailId: item.email.emailId,
          receivedAt: item.email.receivedAt,
          fromName: item.email.fromName,
          fromEmail: item.email.fromEmail,
          to: item.email.to,
          subject: item.email.subject,
          body: item.email.body,
        }}
        classification={item.result.classification}
        disposition={item.result.disposition}
        injection={item.result.injection}
        issues={item.result.issues}
        notes={item.result.notes}
        changeProposal={item.result.changeProposal}
        drafts={item.drafts}
        emailState={item.emailState}
        processed={item.processed}
        emailRejectReason={item.emailRejectReason}
        shipTos={shipTos}
        trace={trace}
        duplicateOf={item.result.duplicateOfEmailId ?? null}
        duplicateOfSo={duplicateOfSo}
        reviewStatus={item.reviewStatus}
      />
    </div>
  );
}
