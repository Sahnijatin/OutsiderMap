import { Screen } from "@/components/app/screen";
import { Skeleton } from "@/components/ui/spinner";

/** A quests-list row: title + subtitle left, status pill right. */
function RowSkeleton() {
  return (
    <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-6 w-20 rounded-full" />
    </div>
  );
}

/**
 * Quests skeleton: header, the three fixed nav cards (market runs, bounties,
 * standings), then quest rows - the same shapes the real page renders.
 */
export default function Loading() {
  return (
    <Screen>
      <p role="status" className="sr-only">
        Loading quests
      </p>
      <Skeleton className="h-3 w-16" />
      <Skeleton className="mt-3 h-9 w-72 max-w-full" />
      <div className="mt-4 flex flex-col gap-3">
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
      </div>
      <div className="mt-6 flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-3">
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
      </div>
    </Screen>
  );
}
