export default function AuditLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-4">
        <div className="h-6 w-24 rounded bg-gray-200" />
        <div className="mt-2 h-4 w-56 rounded bg-gray-100" />
      </div>
      <div className="overflow-hidden rounded border border-gray-200 bg-white">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-gray-100 px-4 py-3 last:border-b-0">
            <div className="h-3 w-32 rounded bg-gray-100" />
            <div className="h-3 w-10 rounded bg-gray-100" />
            <div className="h-3 w-12 rounded bg-gray-100" />
            <div className="h-3 flex-1 rounded bg-gray-100" />
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-400">Loading the audit trail…</p>
    </div>
  );
}
