"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { approveChange, rejectOrder, restoreEmail } from "@/app/actions";
import type { ChangeProposal, CheckIssue, Classification, Disposition, InjectionReport, Urgency } from "@/core/types.js";
import type { DraftState, ShipToOption } from "@/repository/types.js";
import type { TraceStep } from "@/lib/trace";
import { clock, fmtMoney, reviewStatusClass, reviewStatusLabel } from "@/lib/format";
import { DispositionBadge } from "./badge";
import { DraftEditor } from "./draft-editor";
import { SuggestedReply } from "./suggested-reply";
import { Spinner } from "./ui";
import { suggestedReply } from "@/lib/reply";

const SO_PATTERN = /\bSO-\d{3,}\b/g;
const LINKABLE = /(\bSO-\d{3,}\b|\bE\d{3}\b)/g;

/** The repository's reply already says what happened; reuse its verb as the banner headline. */
const VERBS: [RegExp, string][] = [
  [/^Change approved on /, "Change approved"],
  [/^Cancelled /, "Cancelled"],
  [/^Returned /, "Returned"],
  [/^Released /, "Released"],
];

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
  duplicateOfSo: string | null;
  reviewStatus: string;
  urgency: Urgency;
  /** When the last human action on this email happened, if any. */
  decidedAt: string | null;
}) {
  const {
    email,
    classification,
    disposition,
    injection,
    issues,
    notes,
    changeProposal,
    drafts,
    emailRejectReason,
    shipTos,
    trace,
    processed,
    duplicateOf,
    duplicateOfSo,
    reviewStatus,
    urgency,
    decidedAt,
  } = props;
  const soNumbers = [...drafts.map((d) => d.soNumber), ...(changeProposal ? [changeProposal.soNumber] : [])];
  const ownSos = new Set(soNumbers);
  const relatedSos = [...new Set((email.subject + "\n" + email.body).match(SO_PATTERN) ?? [])].filter((so) => !ownSos.has(so));
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
  const [headline, setHeadline] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasDrafts = drafts.length > 0;
  const summary = decisionSummary({ processed, disposition, drafts, issues, changeProposal, notes });
  const rejectedDraft = drafts.find((d) => d.status === "REJECTED") ?? null;
  const closedByHuman = reviewStatus === "no_action" || reviewStatus === "rejected";
  const decided = reviewStatus === "released" || closedByHuman || rejectedDraft !== null;
  const decisionReason = closedByHuman ? emailRejectReason : rejectedDraft?.rejectReason ?? null;
  const decidedStatus = reviewStatus === "released" ? "released" : "no_action";

  function run(label: string, fn: () => Promise<{ ok: boolean; reasons: string[]; detail?: string }>, successHeadline: string) {
    setBusy(label);
    startTransition(async () => {
      try {
        const res = await fn();
        setOk(res.ok);
        if (res.ok) {
          const detail = res.detail ?? "";
          const verb = VERBS.find(([pattern]) => pattern.test(detail));
          setHeadline(verb ? verb[1] : successHeadline);
          setMessage(verb ? detail.replace(verb[0], "") : detail);
        } else {
          setHeadline("Nothing changed");
          setMessage(`Refused: ${res.reasons.join("; ")}`);
        }
      } catch (err) {
        // A failed request used to vanish silently; say it out loud instead.
        setOk(false);
        setHeadline("Nothing changed");
        setMessage(
          `The server rejected the action: ${err instanceof Error ? err.message : String(err)}. Nothing was released or closed.`,
        );
      } finally {
        setBusy(null);
      }
    });
  }

  /** Plain text with the email and order references the reader may want to open. */
  function withLinks(text: string) {
    return text.split(LINKABLE).map((part, i) => {
      if (/^SO-\d{3,}$/.test(part)) {
        return (
          <Link key={i} href={`/so/${part}`} className="font-medium text-blue-700 underline">
            {part}
          </Link>
        );
      }
      if (/^E\d{3}$/.test(part)) {
        return (
          <Link key={i} href={`/emails/${part}`} className="font-medium underline">
            {part}
          </Link>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-white px-4 py-2 text-xs">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Sales order</span>
        {soNumbers.length > 0 ? (
          soNumbers.map((so) => (
            <Link
              key={so}
              href={`/so/${so}`}
              className="rounded bg-gray-100 px-2 py-0.5 font-mono text-gray-800 hover:bg-gray-200 hover:underline"
            >
              {so}
            </Link>
          ))
        ) : (
          <span className="rounded bg-gray-50 px-2 py-0.5 font-mono text-gray-400" title="This email does not create or change an order">
            SO: — not assigned
          </span>
        )}
        {soNumbers[0] && (
          <Link href="/dashboard" className="text-blue-700 hover:underline">
            view on dashboard →
          </Link>
        )}
        {duplicateOf && (
          <Link
            href={duplicateOfSo ? `/so/${duplicateOfSo}` : `/emails/${duplicateOf}`}
            className="rounded bg-violet-100 px-2 py-0.5 text-violet-800 hover:underline"
          >
            duplicate of {duplicateOfSo ?? duplicateOf} →
          </Link>
        )}
        {relatedSos.length > 0 && (
          <span className="flex flex-wrap items-center gap-1 text-gray-500">
            other orders named:
            {relatedSos.map((so) => (
              <Link key={so} href={`/so/${so}`} className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-blue-800 hover:underline">
                {so}
              </Link>
            ))}
          </span>
        )}
        {processed && urgency.level !== "none" && (
          <span
            title={urgency.reason}
            className={`ml-auto rounded px-2 py-0.5 font-medium ${
              urgency.level === "today" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
            }`}
          >
            {urgency.level === "today" ? "Needs it today" : "Time-pressed"}
          </span>
        )}
      </div>

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
        {processed && urgency.level !== "none" && (
          <p className="mt-2 text-sm text-gray-700">
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${urgency.level === "today" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
              {urgency.level === "today" ? "Needs it today" : "Time-pressed"}
            </span>{" "}
            {urgency.reason.charAt(0).toUpperCase() + urgency.reason.slice(1)}
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
                <span className="font-mono text-xs">{i.code}</span> — {withLinks(i.message)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">Raw email</h2>
        <pre className="whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs text-gray-700">{withLinks(email.body)}</pre>
      </div>

      {processed && (
        <section className="rounded-lg border-2 border-dashed border-violet-300 bg-violet-50/60 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded bg-violet-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              AI-generated
            </span>
            <span className="text-xs text-violet-900">Written by the agent from this email — check it before you act on it.</span>
          </div>

          <p className="text-sm text-gray-800">{summary}</p>

          {changeProposal && (
            <div className="mt-4 rounded border border-blue-200 bg-white p-3">
              <div className="text-sm font-semibold text-blue-900">Proposed change</div>
              <p className="mt-1 text-sm text-blue-800">
                {changeProposal.description} (order{" "}
                <Link href={`/so/${changeProposal.soNumber}`} className="font-medium underline">
                  {changeProposal.soNumber}
                </Link>
                , status {changeProposal.orderStatus})
              </p>
              <div className="mt-2">
                <button
                  onClick={() => run("Change approved", () => approveChange(email.emailId), "Change approved")}
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
            <div className="mt-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Draft order — edit before releasing</h3>
              {drafts.map((d) => (
                <DraftEditor key={d.soNumber} emailId={email.emailId} draft={d} shipTos={shipTos} />
              ))}
            </div>
          )}

          {reply && (
            <div className="mt-4">
              <SuggestedReply text={reply} />
            </div>
          )}
        </section>
      )}

      {processed && disposition === "IGNORE" && !decided && (
        <div className="rounded border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase text-gray-500">Auto-ignored</h2>
          <p className="mt-1 text-sm text-gray-600">
            The agent classified this as {classification.toLowerCase().replace(/_/g, " ")} and set it aside. Nothing was created, released or charged.
            Automated mail, notifications and thank-you notes stop here; if a person should still read it, put it back in the queue.
          </p>
          <div className="mt-3">
            <button
              onClick={() => run("Restored", () => restoreEmail(email.emailId), "Restored")}
              disabled={isPending}
              className="flex items-center gap-2 rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60"
            >
              {isPending && busy === "Restored" && <Spinner className="h-3.5 w-3.5" />}
              Restore to inbox
            </button>
          </div>
        </div>
      )}

      <div className="rounded border border-gray-200 bg-white p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase text-gray-500">Human decision</h2>
          {decided && (
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${reviewStatusClass(decidedStatus)}`}>
              {reviewStatusLabel(decidedStatus)}
            </span>
          )}
        </div>

        {message && (
          <div
            role="status"
            className={`mb-3 rounded border px-3 py-2 text-sm ${
              ok === false ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
          >
            <span className="font-medium">{headline ?? "Done"}:</span> {message}
            {ok !== false && /stock|credit/i.test(message) && (
              <Link href="/dashboard" className="ml-2 font-medium underline">
                See stock and credit →
              </Link>
            )}
          </div>
        )}

        {decided ? (
          <div className="rounded bg-gray-50 px-3 py-2">
            <p className="text-sm font-medium text-gray-900">
              {reviewStatus === "released"
                ? `Released${drafts[0] ? ` ${drafts[0].soNumber}` : ""}${drafts[0] ? ` · ${fmtMoney(drafts[0].orderTotal)} of credit used` : ""}`
                : `Closed${rejectedDraft ? ` · ${rejectedDraft.soNumber}` : ""} — ${decisionReason ?? "no reason recorded"}`}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {decidedAt ? `${clock(decidedAt)} · ` : ""}recorded in the audit trail
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {reviewStatus === "released"
                ? "Stock allocated and credit consumed."
                : "Nothing was released, changed or cancelled."}
            </p>
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-gray-600">Nothing is released, changed or cancelled without this step.</p>
            {notes.length > 0 && <p className="mb-2 text-xs text-gray-500">{notes.join(" · ")}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for closing (audited)"
                className="w-64 rounded border border-gray-300 px-2 py-1 text-sm"
              />
              <button
                onClick={() => run("Closed", () => rejectOrder(email.emailId, null, reason.trim() || "no reason given"), "Closed")}
                disabled={isPending || !reason.trim()}
                className="flex items-center gap-2 rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {isPending && busy === "Closed" && <Spinner className="h-3.5 w-3.5" />}
                Close email
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Closing records the reason in the audit trail and changes nothing in the ERP.
            </p>
          </>
        )}
      </div>

      <details className="rounded border border-gray-200 bg-white">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold uppercase text-gray-500">
          Agent trace · {trace.length} steps
        </summary>
        <div className="border-t border-gray-100 p-4">
          <table className="w-full text-sm">
            <tbody>
              {trace.map((t, idx) => (
                <tr key={idx} className="border-b border-gray-50 align-top last:border-0">
                  <td className="w-40 py-1 pr-3 text-xs font-medium text-gray-500">{t.label}</td>
                  <td className="py-1 text-gray-700">{withLinks(t.detail)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

    </div>
  );
}
