import Link from "next/link";
import { notFound } from "next/navigation";
import { getRepository } from "@/lib/repo";
import { clock, fmtMoney, reviewStatusClass, reviewStatusLabel } from "@/lib/format";
import type { Actor } from "@/repository/types.js";

export const dynamic = "force-dynamic";

const ACTOR_CLASS: Record<Actor, string> = {
  agent: "bg-blue-100 text-blue-800",
  system: "bg-gray-200 text-gray-700",
  human: "bg-emerald-100 text-emerald-800",
};

const STATUS_CLASS: Record<string, string> = {
  OPEN: "bg-amber-100 text-amber-800",
  SHIPPED: "bg-emerald-100 text-emerald-800",
  PARTIALLY_SHIPPED: "bg-teal-100 text-teal-800",
  CANCELLED: "bg-red-100 text-red-800",
  RETURNED: "bg-slate-200 text-slate-700",
  DRAFT: "bg-violet-100 text-violet-800",
};

export default async function OrderPage({ params }: { params: Promise<{ so: string }> }) {
  const { so } = await params;
  const soNumber = decodeURIComponent(so).toUpperCase();
  const repo = getRepository();
  const [snapshot, emails, audit] = await Promise.all([repo.getSnapshot(), repo.listInbox(), repo.listAudit()]);

  const order = snapshot.orders.find((o) => o.soNumber === soNumber);
  const lines = snapshot.orderLines.filter((l) => l.soNumber === soNumber);
  if (!order) notFound();

  const customer = snapshot.customers.find((c) => c.customerId === order.customerId);
  const shipTo = snapshot.shipTos.find((s) => s.shipToId === order.shipToId);
  const productName = new Map(snapshot.products.map((p) => [p.sku, p.name]));
  const total = lines.reduce((n, l) => n + l.qtyOrdered * l.unitPrice, 0);

  const linkedEmails = emails.filter(
    (e) =>
      e.drafts.some((d) => d.soNumber === soNumber) ||
      e.result.changeProposal?.soNumber === soNumber ||
      new RegExp(`\\b${soNumber}\\b`).test(`${e.email.subject}\n${e.email.body}`),
  );

  const events = audit.filter((a) => new RegExp(`\\b${soNumber}\\b`).test(a.detail));

  return (
    <div className="space-y-4">
      <div>
        <Link href="/" className="text-sm text-blue-700 hover:underline">
          ← Inbox
        </Link>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-xl font-semibold">{order.soNumber}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[order.status] ?? "bg-gray-100 text-gray-600"}`}>
              {order.status.replace("_", " ")}
            </span>
            {order.draft && <span className="rounded bg-violet-100 px-2 py-0.5 text-xs text-violet-800">agent draft</span>}
          </div>
          <Link href="/dashboard" className="text-sm text-blue-700 hover:underline">
            Stock and credit →
          </Link>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
          <div>
            <dt className="text-xs uppercase text-gray-400">Customer</dt>
            <dd className="text-gray-800">
              {customer ? customer.name : order.customerId} <span className="text-gray-400">({order.customerId})</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-gray-400">Ship to</dt>
            <dd className="text-gray-800">{shipTo ? shipTo.name : order.shipToId}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-gray-400">Customer PO</dt>
            <dd className="font-mono text-gray-800">{order.customerPo || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-gray-400">Released</dt>
            <dd className="text-gray-800">{order.releasedAt ? `${order.releasedAt.slice(0, 10)} ${clock(order.releasedAt)}` : "Not released"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-gray-400">Order date</dt>
            <dd className="text-gray-800">{order.orderDate || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-gray-400">Requested date</dt>
            <dd className="text-gray-800">{order.requestedDate || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-gray-400">Lines</dt>
            <dd className="text-gray-800">{lines.length}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-gray-400">Order total</dt>
            <dd className="font-medium text-gray-900">{fmtMoney(total)}</dd>
          </div>
        </dl>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <h2 className="border-b border-gray-100 px-4 py-2 text-xs font-semibold uppercase text-gray-500">Lines</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase text-gray-500">
              <th className="px-4 py-2">SKU</th>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2 text-right">Shipped</th>
              <th className="px-4 py-2 text-right">Unit price</th>
              <th className="px-4 py-2 text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={`${l.lineNo}-${l.sku}`} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-2 font-mono text-xs text-gray-600">{l.sku}</td>
                <td className="px-4 py-2 text-gray-800">{productName.get(l.sku) ?? "—"}</td>
                <td className="px-4 py-2 text-right">{l.qtyOrdered}</td>
                <td className="px-4 py-2 text-right text-gray-500">{l.qtyShipped}</td>
                <td className="px-4 py-2 text-right">{fmtMoney(l.unitPrice)}</td>
                <td className="px-4 py-2 text-right">{fmtMoney(l.qtyOrdered * l.unitPrice)}</td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-sm text-gray-400">
                  No lines on this order.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <h2 className="border-b border-gray-100 px-4 py-2 text-xs font-semibold uppercase text-gray-500">
          Emails about this order · {linkedEmails.length}
        </h2>
        <ul className="divide-y divide-gray-50">
          {linkedEmails.map((e) => (
            <li key={e.email.emailId} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
              <span className="w-16 text-xs text-gray-400">{clock(e.email.receivedAt)}</span>
              <Link href={`/emails/${e.email.emailId}`} className="text-blue-700 hover:underline">
                {e.email.subject}
              </Link>
              <span className="text-xs text-gray-500">{e.email.fromName}</span>
              <span className="ml-auto flex items-center gap-2">
                {e.processed && (
                  <span className={`rounded px-1.5 py-0.5 text-[11px] ${reviewStatusClass(e.reviewStatus)}`}>
                    {reviewStatusLabel(e.reviewStatus)}
                  </span>
                )}
                <span className="font-mono text-[11px] text-gray-400">{e.email.emailId}</span>
              </span>
            </li>
          ))}
          {linkedEmails.length === 0 && <li className="px-4 py-4 text-sm text-gray-400">No email produced or mentions this order.</li>}
        </ul>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <h2 className="border-b border-gray-100 px-4 py-2 text-xs font-semibold uppercase text-gray-500">
          Audit for this order · {events.length}
        </h2>
        <table className="w-full text-sm">
          <tbody>
            {events.map((r) => (
              <tr key={r.id} className="border-b border-gray-50 align-top last:border-0">
                <td className="w-16 px-4 py-1.5 text-xs text-gray-400">{clock(r.timestamp)}</td>
                <td className="w-20 px-2 py-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${ACTOR_CLASS[r.actor]}`}>{r.actor}</span>
                </td>
                <td className="w-40 px-2 py-1.5 font-mono text-xs text-gray-600">{r.action}</td>
                <td className="px-4 py-1.5 text-gray-700">{r.detail}</td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-center text-sm text-gray-400">
                  Nothing has happened to this order yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
