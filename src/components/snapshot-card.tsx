import type { ErpSnapshot } from "@/core/types.js";

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export function SnapshotCard({ snapshot }: { snapshot: ErpSnapshot }) {
  const active = snapshot.customers.filter((c) => c.status === "ACTIVE");
  const onHold = snapshot.customers.length - active.length;
  const headroom = active.reduce((sum, c) => sum + Math.max(0, c.creditLimit - c.openBalance), 0);
  const outOfStock = snapshot.inventory.filter((i) => i.available <= 0).length;
  const openOrders = snapshot.orders.filter((o) => o.status !== "SHIPPED").length;
  const activeSkus = snapshot.products.filter((p) => p.status === "ACTIVE").length;

  const cells = [
    { label: "Customers", value: snapshot.customers.length.toString(), note: onHold ? `${onHold} on credit hold` : "all active" },
    { label: "Products", value: activeSkus.toString(), note: `${snapshot.products.length - activeSkus} discontinued` },
    { label: "Open orders", value: openOrders.toString(), note: "in the ERP now" },
    { label: "Credit headroom", value: money(headroom), note: "across active accounts" },
    { label: "Out of stock", value: outOfStock.toString(), note: "SKUs at zero available" },
  ];

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-gray-900">ERP snapshot loaded</h2>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        {cells.map((c) => (
          <div key={c.label}>
            <dt className="text-xs text-gray-500">{c.label}</dt>
            <dd className="text-sm font-semibold text-gray-900">{c.value}</dd>
            <dd className="text-[11px] text-gray-400">{c.note}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
