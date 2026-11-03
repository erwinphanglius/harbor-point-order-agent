export default function InboxLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-4">
        <div className="h-6 w-24 rounded bg-gray-200" />
        <div className="mt-2 h-4 w-40 rounded bg-gray-100" />
      </div>
      <div className="mb-4 flex gap-2">
        {[64, 96, 88, 92, 72, 80, 72].map((w, i) => (
          <div key={i} className="h-7 rounded-full bg-gray-100" style={{ width: w }} />
        ))}
      </div>
      <div className="overflow-hidden rounded border border-gray-200 bg-white">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-gray-100 px-4 py-3 last:border-b-0">
            <div className="h-3 w-10 rounded bg-gray-100" />
            <div className="h-3 w-40 rounded bg-gray-100" />
            <div className="h-3 flex-1 rounded bg-gray-100" />
            <div className="h-3 w-28 rounded bg-gray-100" />
            <div className="h-5 w-20 rounded-full bg-gray-100" />
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-400">Loading the inbox…</p>
    </div>
  );
}
