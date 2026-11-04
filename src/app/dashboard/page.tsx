import Link from "next/link";
import { getRepository } from "@/lib/repo";
import { fmtMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const repo = getRepository();
  const dash = await repo.getDashboard();
  const { totals } = dash;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">ERP snapshot</h1>
        <p className="text-sm text-gray-500">
          Read-only view of the mock ERP. Releasing an order allocates stock and consumes credit — this page shows the result.
        </p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs uppercase text-gray-500">Credit used</div>
          <div className="mt-1 text-lg font-semibold">{fmtMoney(totals.creditUsed)}</div>
          <div className="text-xs text-gray-400">of {fmtMoney(totals.creditLimit)} extended</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs uppercase text-gray-500">Open drafts</div>
          <div className="mt-1 text-lg font-semibold">{totals.openOrders}</div>
          <div className="text-xs text-gray-400">{totals.released} released</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs uppercase text-gray-500">Low stock</div>
          <div className="mt-1 text-lg font-semibold">{totals.lowStock}</div>
          <div className="text-xs text-gray-400">SKUs under 10 available</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs uppercase text-gray-500">Products</div>
          <div className="mt-1 text-lg font-semibold">{totals.products}</div>
          <div className="text-xs text-gray-400">in the catalogue</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-2 text-sm font-semibold">Stock</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-3 py-2 whitespace-nowrap">SKU</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">List</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Available</th>
              </tr>
            </thead>
            <tbody>
              {dash.inventory.map((i) => (
                <tr key={i.sku} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-1.5 font-mono text-xs whitespace-nowrap">{i.sku}</td>
                  <td className="px-3 py-1.5">
                    {i.name}
                    {i.status !== "active" && (
                      <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-gray-500">{i.status}</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap text-gray-500">{fmtMoney(i.listPrice)}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">
                    <span className={`font-medium ${i.available <= 0 ? "text-red-600" : i.available < 10 ? "text-amber-600" : "text-gray-900"}`}>
                      {i.available}
                    </span>
                    <span className="block text-[10px] leading-tight text-gray-400">
                      {i.onHand} on hand · {i.allocated} allocated
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-2 text-sm font-semibold">Credit</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2 text-right">Used</th>
                  <th className="px-3 py-2 text-right">Limit</th>
                  <th className="px-3 py-2 text-right">Headroom</th>
                </tr>
              </thead>
              <tbody>
                {dash.customers.map((c) => (
                  <tr key={c.customerId} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-1.5">
                      {c.name}
                      {c.status !== "active" && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase text-amber-800">{c.status}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right text-gray-600">{fmtMoney(c.openBalance)}</td>
                    <td className="px-3 py-1.5 text-right text-gray-600">{fmtMoney(c.creditLimit)}</td>
                    <td className={`px-3 py-1.5 text-right font-medium ${c.headroom <= 0 ? "text-red-600" : c.headroom < 1000 ? "text-amber-600" : "text-gray-900"}`}>
                      {fmtMoney(c.headroom)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-2 text-sm font-semibold">Orders</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <th className="px-3 py-2">SO</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {dash.orders.map((o) => (
                  <tr key={o.soNumber} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-1.5 font-mono text-xs">{o.soNumber}</td>
                    <td className="px-3 py-1.5">{o.customerName}</td>
                    <td className="px-3 py-1.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                          o.status === "RELEASED" ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right">{fmtMoney(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-gray-400">
        Values move only after a human decision — <Link href="/" className="underline">back to the inbox</Link>.
      </p>
    </div>
  );
}
