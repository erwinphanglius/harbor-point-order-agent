import type { ErpSnapshot, ProcessingResult } from "../core/types.js";

export interface TraceStep {
  label: string;
  detail: string;
}

export function buildTrace(result: ProcessingResult, snapshot: ErpSnapshot): TraceStep[] {
  const steps: TraceStep[] = [];

  steps.push({ label: "Classified as", detail: result.classification });

  steps.push({
    label: "Customer",
    detail: result.customerFound ? `${result.customerName ?? "unknown"} (${result.customerId})` : "not identified",
  });

  if (result.injection.detected) {
    steps.push({ label: "Injection", detail: result.injection.indicators.join(", ") });
  }

  for (const draft of result.drafts) {
    steps.push({
      label: "Draft order",
      detail: `${draft.customerName} → ship-to ${draft.shipToId}, ${draft.lines.length} line(s), total $${draft.orderTotal}`,
    });
    for (const line of draft.lines) {
      const product = snapshot.products.find((p) => p.sku === line.sku);
      steps.push({
        label: `Line ${line.lineNo}`,
        detail: `${line.sku} ${product?.name ?? line.description} x ${line.quantity} @ $${line.unitPrice} (${line.priceSource})`,
      });
    }
  }

  if (result.changeProposal) {
    steps.push({
      label: "Change proposal",
      detail: `${result.changeProposal.description} (order ${result.changeProposal.soNumber}, ${result.changeProposal.orderStatus})`,
    });
  }

  for (const i of result.issues) {
    steps.push({ label: `Issue (${i.severity})`, detail: `${i.code}: ${i.message}` });
  }

  for (const note of result.notes) {
    steps.push({ label: "Note", detail: note });
  }

  for (const entry of result.audit) {
    steps.push({ label: `Audit (${entry.actor})`, detail: `${entry.action}: ${entry.detail}` });
  }

  return steps;
}
