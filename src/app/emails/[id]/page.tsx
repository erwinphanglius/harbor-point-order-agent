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

  return (
    <div>
      <div className="mb-4">
        <Link href="/" className="text-sm text-blue-700 hover:underline">
          ← Inbox
        </Link>
      </div>
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
        emailRejectReason={item.emailRejectReason}
        shipTos={shipTos}
        trace={trace}
      />
    </div>
  );
}
