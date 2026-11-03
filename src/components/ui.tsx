export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  );
}

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className}`} />;
}

/** Thin progress bar used while a page or a long action is working. */
export function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded bg-gray-200 ${className}`}>
      <div className="h-full rounded bg-gray-900 transition-all duration-300" style={{ width: `${pct}%` }} />
    </div>
  );
}
