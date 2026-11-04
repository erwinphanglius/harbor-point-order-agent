import type { AgentStatus } from "@/repository/types.js";
import type { ErpSnapshot } from "@/core/types.js";
import type { InboxRow } from "@/components/inbox-client";

function money(n: number): string {
  if (n > 0 && n < 10) return `$${n.toFixed(2)}`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/**
 * What the inbox is worth right now: before a run it is the state the demo
 * starts from, after a run it is what the agent produced. Same slot, so the
 * first thing on the page answers "so what happened?".
 */
export function RunResult({ rows, status, snapshot }: { rows: InboxRow[]; status: AgentStatus; snapshot: ErpSnapshot }) {
  const processed = rows.filter((r) => r.processed);
  const drafts = processed.filter((r) => r.disposition === "AUTO_DRAFT");
  const proposals = processed.filter((r) => r.disposition === "PROPOSE_CHANGE");
  const needPerson = processed.filter((r) => r.disposition === "ESCALATE");
  const urgent = processed.filter((r) => r.urgency && r.urgency.level !== "none");
  const ignored = processed.filter((r) => r.disposition === "IGNORE");
  const draftValue = drafts.reduce((sum, r) => sum + (r.amount ?? 0), 0);

  if (processed.length === 0) {
    const openOrders = snapshot.orders.filter((o) => o.status !== "SHIPPED").length;
    const used = snapshot.customers.reduce((sum, c) => sum + c.openBalance, 0);
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Nothing read yet</h2>
        <p className="mt-1 text-sm text-gray-600">
          {status.total} emails waiting. The ERP is loaded underneath: {openOrders} open orders, {money(used)} of credit in use.
        </p>
        <p className="mt-2 text-xs text-gray-500">
          Press <span className="font-medium text-gray-700">Run agent</span> and it reads all {status.total} in batches of 10 — about two minutes.
        </p>
      </section>
    );
  }

  const cells = [
    {
      label: "Drafted",
      value: drafts.length.toString(),
      note: draftValue > 0 ? `${money(draftValue)} waiting for a human` : "ready for release",
    },
    { label: "Need a person", value: needPerson.length.toString(), note: proposals.length ? `plus ${proposals.length} change proposals` : "escalated with a reason" },
    { label: "Urgent", value: urgent.length.toString(), note: "deadline read from the email" },
    { label: "Set aside", value: ignored.length.toString(), note: "spam, auto-replies, notifications" },
  ];

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">What the agent did</h2>
      <p className="mt-1 text-sm text-gray-600">
        {processed.length} of {status.total} emails read in {status.runs} batch{status.runs === 1 ? "" : "es"} · {money(status.costUsd)} on{" "}
        {status.model}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        {cells.map((c) => (
          <div key={c.label}>
            <dt className="text-xs text-gray-500">{c.label}</dt>
            <dd className="text-base font-semibold text-gray-900">{c.value}</dd>
            <dd className="text-[11px] text-gray-400">{c.note}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11px] text-gray-400">Nothing is released until a human approves it.</p>
    </section>
  );
}
