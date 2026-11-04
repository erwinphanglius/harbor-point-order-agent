"use client";

import { useState, useTransition } from "react";
import { releaseWithEditsAction } from "@/app/actions";
import { fmtMoney } from "@/lib/format";
import type { DraftState, ShipToOption } from "@/repository/types.js";

export function DraftEditor({
  emailId,
  draft,
  shipTos,
}: {
  emailId: string;
  draft: DraftState;
  shipTos: ShipToOption[];
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(draft.lines.map((l) => [l.sku, l.quantity])),
  );
  const [shipToId, setShipToId] = useState(draft.shipToId);
  const [requestedDate, setRequestedDate] = useState(draft.requestedDate ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (draft.status !== "DRAFT") {
    return (
      <div className="rounded border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="font-medium">{draft.soNumber}</div>
          <span className={`rounded-full px-2 py-0.5 text-xs ${draft.status === "RELEASED" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>
            {draft.status}
          </span>
        </div>
        {draft.rejectReason && <p className="mt-1 text-sm text-gray-500">Reason: {draft.rejectReason}</p>}
      </div>
    );
  }

  function run(fn: () => Promise<{ ok: boolean; reasons: string[] }>, success: string) {
    startTransition(async () => {
      const res = await fn();
      setMessage(res.ok ? success : `Refused: ${res.reasons.join("; ")}`);
    });
  }

  function editedLines() {
    return draft.lines.map((l) => ({ sku: l.sku, quantity: quantities[l.sku] ?? l.quantity }));
  }

  // What a person has changed, so the button says so before it releases.
  const changedLines = draft.lines.filter((l) => (quantities[l.sku] ?? l.quantity) !== l.quantity);
  const shipToChanged = shipToId !== draft.shipToId;
  const dateChanged = requestedDate !== (draft.requestedDate ?? "");
  const edited = changedLines.length > 0 || shipToChanged || dateChanged;
  const editedNote = [
    ...changedLines.map((l) => `${l.sku} ${l.quantity} → ${quantities[l.sku]}`),
    ...(shipToChanged ? [`ship-to ${shipToId}`] : []),
    ...(dateChanged ? [`date ${requestedDate || "cleared"}`] : []),
  ];
  const liveTotal = draft.lines.reduce((sum, l) => sum + l.unitPrice * (quantities[l.sku] ?? l.quantity), 0);

  return (
    <div className="rounded border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-medium">{draft.soNumber}</div>
        <div className="text-sm text-gray-600">
          {draft.customerName} · PO {draft.customerPo || "—"} · total {fmtMoney(liveTotal)}
        </div>
      </div>

      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-gray-600">Ship-to</label>
        <select
          value={shipToId}
          onChange={(e) => setShipToId(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          {shipTos.map((s) => (
            <option key={s.shipToId} value={s.shipToId}>
              {s.name} ({s.shipToId})
            </option>
          ))}
        </select>
        <label className="ml-4 mr-1 text-xs font-medium text-gray-600">Requested date</label>
        <input
          type="date"
          value={requestedDate}
          onChange={(e) => setRequestedDate(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        />
      </div>

      <table className="mb-3 w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs uppercase text-gray-500">
            <th className="py-1">SKU</th>
            <th className="py-1">Description</th>
            <th className="py-1">Qty</th>
            <th className="py-1 text-right">Price</th>
            <th className="py-1 text-right">Line total</th>
          </tr>
        </thead>
        <tbody>
          {draft.lines.map((l) => (
            <tr key={l.sku} className="border-b border-gray-50 last:border-0">
              <td className="py-1">{l.sku}</td>
              <td className="py-1 text-gray-600">{l.description}</td>
              <td className="py-1">
                <input
                  type="number"
                  min={1}
                  value={quantities[l.sku] ?? l.quantity}
                  onChange={(e) => setQuantities((q) => ({ ...q, [l.sku]: parseInt(e.target.value, 10) || 0 }))}
                  className="w-16 rounded border border-gray-300 px-1 py-0.5 text-sm"
                />
              </td>
              <td className="py-1 text-right">
                {fmtMoney(l.unitPrice)} <span className="text-xs text-gray-400">({l.priceSource})</span>
              </td>
              <td className="py-1 text-right">{fmtMoney(l.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() =>
            run(
              () =>
                releaseWithEditsAction(emailId, draft.soNumber, {
                  lines: editedLines(),
                  shipToId,
                  requestedDate: requestedDate || null,
                }),
              edited ? "Your edits were saved and the order released." : "Released.",
            )
          }
          disabled={isPending}
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Approve &amp; release
        </button>
        {edited && (
          <span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800" title={editedNote.join(", ")}>
            edited: {editedNote.slice(0, 2).join(", ")}
            {editedNote.length > 2 ? ` +${editedNote.length - 2}` : ""}
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Whatever is on screen is saved first, then released. Stock, credit and price are re-checked at that moment.
      </p>

      {message && <div className="mt-3 rounded bg-gray-50 px-3 py-2 text-sm">{message}</div>}
    </div>
  );
}
