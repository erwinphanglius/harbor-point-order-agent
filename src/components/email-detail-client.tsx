"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { approveChange, markNoAction, rejectOrder } from "@/app/actions";
import type { ChangeProposal, CheckIssue, Classification, Disposition, InjectionReport } from "@/core/types.js";
import type { DraftState, ShipToOption } from "@/repository/types.js";
import type { TraceStep } from "@/lib/trace";
import { clock, fmtMoney } from "@/lib/format";
import { DispositionBadge } from "./badge";
import { DraftEditor } from "./draft-editor";
import { Spinner } from "./ui";

const STATUS_STYLE: Record<string, string> = {
  released: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  approved: "bg-blue-100 text-blue-800",
  no_action: "bg-gray-100 text-gray-600",
};
import { SuggestedReply } from "./suggested-reply";
import { suggestedReply } from "@/lib/reply";

/** One plain sentence: what this email is, and what approving it would do. */
function decisionSummary(args: {
  processed: boolean;
  disposition: Disposition;
  drafts: DraftState[];
  issues: CheckIssue[];
  changeProposal: ChangeProposal | null;
  notes: string[];
}): string {
  const { processed, disposition, drafts, issues, changeProposal, notes } = args;
  if (!processed) return "Not processed yet — press Run agent on the inbox and the agent will read this email.";
  switch (disposition) {
    case "AUTO_DRAFT": {
      const open = drafts.filter((d) => d.status === "DRAFT");
      if (open.length === 0) return "Order already handled — no draft is waiting on you.";
      const total = open.reduce((n, d) => n + d.orderTotal, 0);
      return `Clean order: ${open.length} draft${open.length > 1 ? "s" : ""} worth ${fmtMoney(total)} ready to release. Approving allocates stock and uses credit; rejecting changes nothing.`;
    }
    case "PROPOSE_CHANGE":
      return changeProposal
        ? `Customer wants to change an existing order: ${changeProposal.description}. Approving applies it; rejecting leaves the order untouched.`
        : "Customer wants a change to an existing order.";
    case "ESCALATE":
      return `Held for a human: ${issues[0]?.message ?? notes[0] ?? "a rule blocked automatic handling"}. Nothing was ordered automatically.`;
    case "DUPLICATE":
      return `Same order as an earlier email (${issues[0]?.message ?? notes.find((n) => /duplicate|already seen/i.test(n)) ?? "resend"}) — safe to ignore, nothing new to release.`;
    case "ROUTE":
      return `Not an order — routed for a human to read (${notes[0] ?? "non-order email"}).`;
    case "IGNORE":
      return "Nothing to action: this is not an order and needs no reply.";
    default:
      return "";
  }
}

export function EmailDetailClient(props: {
  email: {
    emailId: string;
    receivedAt: string;
    fromName: string;
    fromEmail: string;
    to: string;
    subject: string;
    body: string;
  };
  classification: Classification;
  disposition: Disposition;
  injection: InjectionReport;
  issues: CheckIssue[];
  notes: string[];
  changeProposal: ChangeProposal | null;
  drafts: DraftState[];
  emailState: string;
  processed: boolean;
  emailRejectReason: string | null;
  shipTos: ShipToOption[];
  trace: TraceStep[];
  duplicateOf: string | null;
  reviewStatus: string;
}) {
  const { email, classification, disposition, injection, issues, notes, changeProposal, drafts, emailState, emailRejectReason, shipTos, trace, processed, duplicateOf, reviewStatus } =
    props;
  const soNumbers = [...drafts.map((d) => d.soNumber), ...(changeProposal ? [changeProposal.soNumber] : [])];
  const reply = processed
    ? suggestedReply({
        disposition,
        fromName: email.fromName,
        customerName: null,
        issues,
        drafts: drafts.map((d) => ({ soNumber: d.soNumber, orderTotal: d.orderTotal })),
        changeProposal: changeProposal ? { soNumber: changeProposal.soNumber, kind: changeProposal.kind, description: changeProposal.description } : null,
        duplicateOf,
      })
    : null;
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasDrafts = drafts.length > 0;
  const summary = decisionSummary({ processed, disposition, drafts, issues, changeProposal, notes });

  function run(label: string, fn: () => Promise<{ ok: boolean; reasons: string[]; detail?: string }>) {
    setBusy(label);
    startTransition(async () => {
      const res = await fn();
      setOk(res.ok);
      setMessage(res.ok ? res.detail ?? `${label} done.` : `Refused: ${res.reasons.join("; ")}`);
      setBusy(null);
    });
  }

  /** Issue text often names the email or order it refers to; make it clickable. */
  function linkify(text: string) {
    const parts = text.split(/(E\d{3})/g);
    return parts.map((part, i) =>
      /^E\d{3}$/.test(part) ? (
        <Link key={i} href={`/emails/${part}`} className="font-medium underline">
          {part}
        </Link>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded border border-gray-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {processed ? (
              <>
                <DispositionBadge disposition={disposition} />
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{classification}</span>
              </>
            ) : (
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Not processed</span>
            )}
          </div>
          <span className="text-xs text-gray-400">{clock(email.receivedAt)}</span>
        </div>
        {(soNumbers.length > 0 || duplicateOf) && (
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            {soNumbers.map((so) => (
              <span key={so} className="rounded bg-gray-100 px-2 py-0.5 font-mono text-gray-700">
                {so}
              </span>
            ))}
            {soNumbers[0] && (
              <Link href="/dashboard" className="text-blue-700 hover:underline">
                view on dashboard →
              </Link>
            )}
            {duplicateOf && (
              <Link href={`/emails/${duplicateOf}`} className="rounded bg-violet-100 px-2 py-0.5 text-violet-800 hover:underline">
                duplicate of {duplicateOf} →
              </Link>
            )}
          </div>
        )}
        <h1 className="text-lg font-semibold">{email.subject}</h1>
        <p className="mt-1 text-sm text-gray-500">
          From {email.fromName} &lt;{email.fromEmail}&gt; to {email.to}
        </p>
        {emailState !== "pending" && (
          <p className="mt-2 text-sm text-gray-500">
            {emailState === "no_action" ? "Marked as no action." : ""}
            {emailRejectReason ? ` Rejection reason: ${emailRejectReason}` : ""}
          </p>
        )}
      </div>

      {injection.detected && (
        <div className="rounded border border-red-300 bg-red-50 p-4">
          <div className="font-medium text-red-800">Prompt-injection attempt detected</div>
          <p className="mt-1 text-sm text-red-700">
            Indicators: {injection.indicators.join(", ")}. This email is forced to human review.
          </p>
          {injection.excerpt && <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">{injection.excerpt}</pre>}
        </div>
      )}

      {issues.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-4">
          <div className="font-medium text-amber-800">Rule results / warnings</div>
          <ul className="mt-1 list-inside list-disc text-sm text-amber-800">
            {issues.map((i, idx) => (
              <li key={idx}>
                <span className="font-mono text-xs">{i.code}</span> — {linkify(i.message)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {changeProposal && (
        <div className="rounded border border-blue-200 bg-blue-50 p-4">
          <div className="font-medium text-blue-900">Proposed change</div>
          <p className="mt-1 text-sm text-blue-800">
            {changeProposal.description} (order {changeProposal.soNumber}, status {changeProposal.orderStatus})
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => run("Change approved", () => approveChange(email.emailId))}
              disabled={isPending}
              className="flex items-center gap-2 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {isPending && busy === "Change approved" && <Spinner className="h-3.5 w-3.5" />}
              Approve change
            </button>
          </div>
        </div>
      )}

      {hasDrafts && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase text-gray-500">Extracted proposal</h2>
          {drafts.map((d) => (
            <DraftEditor key={d.soNumber} emailId={email.emailId} draft={d} shipTos={shipTos} />
          ))}
        </div>
      )}

      {reply && <SuggestedReply text={reply} />}

      <div className="rounded border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">Raw email</h2>
        <pre className="whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs text-gray-700">{email.body}</pre>
      </div>

      <details className="rounded border border-gray-200 bg-white">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold uppercase text-gray-500">
          Agent trace · {trace.length} steps
        </summary>
        <div className="border-t border-gray-100 p-4">
          <table className="w-full text-sm">
            <tbody>
              {trace.map((t, idx) => (
                <tr key={idx} className="border-b border-gray-50 last:border-0 align-top">
                  <td className="w-40 py-1 pr-3 text-xs font-medium text-gray-500">{t.label}</td>
                  <td className="py-1 text-gray-700">{t.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="rounded border border-gray-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold uppercase text-gray-500">Human decision</h2>
        {reviewStatus !== "pending" && (
          <p className={`mb-2 inline-block rounded px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[reviewStatus] ?? "bg-gray-100 text-gray-600"}`}>
            {reviewStatus.replace("_", " ")}
            {reviewStatus === "released" && drafts[0] ? ` · ${drafts[0].soNumber} · ${fmtMoney(drafts[0].orderTotal)} credit used` : ""}
          </p>
        )}
        <p className="mb-3 text-sm text-gray-700">{summary}</p>
        <div className="mb-3">
          {message && (
            <div
              role="status"
              className={`rounded border px-3 py-2 text-sm ${
                ok === false ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-900"
              }`}
            >
              <span className="font-medium">{ok === false ? "Nothing changed." : "Done."}</span> {message}
              {/released|allocated|stock|credit/i.test(message) && (
                <Link href="/dashboard" className="ml-2 font-medium underline">
                  See stock and credit →
                </Link>
              )}
            </div>
          )}
        </div>
        {notes.length > 0 && <p className="mb-2 text-xs text-gray-500">{notes.join(" · ")}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (audited)"
            className="w-56 rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <button
            onClick={() => run("Rejected", () => rejectOrder(email.emailId, null, reason || "no reason given"))}
            disabled={isPending || !reason.trim()}
            className="flex items-center gap-2 rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {isPending && busy === "Rejected" && <Spinner className="h-3.5 w-3.5" />}
            Reject with reason
          </button>
          <button
            onClick={() => run("Marked no action", () => markNoAction(email.emailId))}
            disabled={isPending}
            className="flex items-center gap-2 rounded bg-gray-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-60"
          >
            {isPending && busy === "Marked no action" && <Spinner className="h-3.5 w-3.5" />}
            Mark as no-action
          </button>
        </div>
      </div>
    </div>
  );
}
