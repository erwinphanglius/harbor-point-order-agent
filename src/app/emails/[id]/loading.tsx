export default function EmailLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-4 h-4 w-16 rounded bg-gray-100" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded border border-gray-200 bg-white p-4">
          <div className="h-5 w-24 rounded-full bg-gray-100" />
          <div className="mt-3 h-5 w-2/3 rounded bg-gray-200" />
          <div className="mt-2 h-3 w-1/2 rounded bg-gray-100" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-3 w-full rounded bg-gray-100" />
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <div className="h-9 w-36 rounded bg-gray-200" />
            <div className="h-9 w-40 rounded bg-gray-100" />
            <div className="h-9 w-24 rounded bg-gray-100" />
          </div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4">
          <div className="h-4 w-20 rounded bg-gray-200" />
          <div className="mt-3 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-3 w-full rounded bg-gray-100" />
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-gray-400">Loading the email…</p>
    </div>
  );
}
