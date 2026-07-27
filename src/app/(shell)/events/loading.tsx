import { Screen } from "@/components/app/screen";
import { Skeleton } from "@/components/ui/spinner";

/** An event card: time row, title, venue line, tag pills. */
function EventSkeleton() {
  return (
    <div className="flex h-full flex-col gap-2 rounded-card border border-line bg-surface p-5">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <div className="flex gap-1.5">
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
    </div>
  );
}

/** Events skeleton: header plus the card grid the real page renders. */
export default function Loading() {
  return (
    <Screen className="flex flex-col gap-10">
      <p role="status" className="sr-only">
        Loading events
      </p>
      <div>
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-3 h-9 w-64 max-w-full" />
      </div>
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2">
        <EventSkeleton />
        <EventSkeleton />
        <EventSkeleton />
        <EventSkeleton />
      </div>
    </Screen>
  );
}
