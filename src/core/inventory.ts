import type { IncomingSupply, Inventory } from "./types.js";

export interface StockCheck {
  ok: boolean;
  available: number;
  shortfall: number;
  nextArrival: string | null;
}

export function checkStock(
  sku: string,
  quantity: number,
  inventory: Inventory[],
  incoming: IncomingSupply[],
): StockCheck {
  const inv = inventory.find((i) => i.sku === sku);
  const available = inv ? inv.available : 0;
  if (available >= quantity) {
    return { ok: true, available, shortfall: 0, nextArrival: null };
  }
  const shortfall = quantity - available;
  const arrivals = incoming
    .filter((i) => i.sku === sku)
    .map((i) => i.expectedDate)
    .sort();
  return { ok: false, available, shortfall, nextArrival: arrivals[0] ?? null };
}
