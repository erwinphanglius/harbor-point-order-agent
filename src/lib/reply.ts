import type { Disposition } from "@/core/types.js";

export interface ReplyContext {
  disposition: Disposition;
  fromName: string;
  customerName: string | null;
  issues: { code: string; message: string }[];
  drafts: { soNumber: string; orderTotal: number }[];
  changeProposal: { soNumber: string; kind: string; description: string } | null;
  duplicateOf: string | null;
}

function firstName(name: string): string {
  return name.split(/[\s,]+/)[0] || "there";
}

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * A reply a clerk can paste without rewriting. Plain, short, no promises the
 * app cannot keep: it says what is happening now, not what the ERP will do.
 */
export function suggestedReply(ctx: ReplyContext): string | null {
  const hi = `Hi ${firstName(ctx.customerName ?? ctx.fromName)},`;
  const sign = "Thanks,\nHarbor Point order desk";

  switch (ctx.disposition) {
    case "AUTO_DRAFT": {
      const d = ctx.drafts[0];
      if (!d) return null;
      return `${hi}\n\nWe've got your order — it's queued as ${d.soNumber} for ${money(d.orderTotal)} and heading to the warehouse for confirmation.\n\n${sign}`;
    }
    case "PROPOSE_CHANGE":
      return `${hi}\n\nThanks for the note on ${ctx.changeProposal?.soNumber ?? "your order"}. We've logged the change and someone from our team will confirm it with you shortly.\n\n${sign}`;
    case "DUPLICATE": {
      const ref = ctx.duplicateOf ? ` (your earlier email ${ctx.duplicateOf})` : "";
      return `${hi}\n\nThis looks like a resend of an order we already have${ref}, so there's nothing you need to do — it's in the queue and we'll confirm it as usual.\n\n${sign}`;
    }
    case "ESCALATE": {
      const reason = ctx.issues[0]?.message ?? "a detail we need to check before we can confirm";
      return `${hi}\n\nThanks for your email. Before we can confirm this one we need to sort out ${reason.toLowerCase()}. I'm checking it now and will come back to you today with a firm answer.\n\n${sign}`;
    }
    case "ROUTE":
      return `${hi}\n\nThanks for getting in touch — I've passed this to the right person here and you'll hear back shortly.\n\n${sign}`;
    default:
      return null;
  }
}
