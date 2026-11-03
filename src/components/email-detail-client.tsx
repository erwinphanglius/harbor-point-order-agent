"use client";

import { useState, useTransition } from "react";
import { approveChange, markNoAction, rejectOrder } from "@/app/actions";
import type { ChangeProposal, CheckIssue, Classification, Disposition, InjectionReport } from "@/core/types.js";
import type { DraftState, ShipToOption } from "@/repository/types.js";
import type { TraceStep } from "@/lib/trace";
import { clock } from "@/lib/format";
import { DispositionBadge } from "./badge";
import { DraftEditor } from "./draft-editor";

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
}) {
  const { email, classification, disposition, injection, issues, notes, changeProposal, drafts, emailState, emailRejectReason, shipTos, trace, processed } =
    props;
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasDrafts = drafts.length > 0;

  function run(fn: () => Promise<{ ok: boolean; reasons: string[] }>, success: string) {
    startTransition(async () => {
      const res = await fn();
      setMessage(res.ok ? success : `Refused: ${res.reasons.join("; ")}`);
    });
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
                <span className="font-mono text-xs">{i.code}</span> — {i.message}
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
              onClick={() => run(() => approveChange(email.emailId), "Change approved.")}
              disabled={isPending}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
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

      <div className="rounded border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">Raw email</h2>
        <pre className="whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs text-gray-700">{email.body}</pre>
      </div>

      <div className="rounded border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">Agent trace</h2>
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

      <div className="rounded border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">Human decision</h2>
        {notes.length > 0 && <p className="mb-2 text-xs text-gray-500">{notes.join(" · ")}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (audited)"
            className="w-56 rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <button
            onClick={() => run(() => rejectOrder(email.emailId, null, reason || "no reason given"), "Rejected.")}
            disabled={isPending || !reason.trim()}
            className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            Reject with reason
          </button>
          <button
            onClick={() => run(() => markNoAction(email.emailId), "Marked as no action.")}
            disabled={isPending}
            className="rounded bg-gray-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            Mark as no-action
          </button>
        </div>
        {message && <div className="mt-3 rounded bg-gray-50 px-3 py-2 text-sm">{message}</div>}
      </div>
    </div>
  );
}
