import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div>
      <Skeleton className="mb-2 h-6 w-40" />
      <Skeleton className="mb-4 h-3 w-80" />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80" />
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-36" />
        </div>
      </div>
    </div>
  );
}
