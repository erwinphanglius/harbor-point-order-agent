import type { Disposition } from "@/core/types.js";
import { dispositionBadgeClass, dispositionLabel } from "@/lib/format";

export function DispositionBadge({ disposition }: { disposition: Disposition }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${dispositionBadgeClass(disposition)}`}>
      {dispositionLabel(disposition)}
    </span>
  );
}
