import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-28" />
      <Skeleton className="h-16" />
      <Skeleton className="h-40" />
      <Skeleton className="h-24" />
    </div>
  );
}
