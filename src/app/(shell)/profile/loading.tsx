import { Screen } from "@/components/app/screen";
import { Skeleton } from "@/components/ui/spinner";

/**
 * Profile skeleton: the wide two-column shape of the taste profile page -
 * identity card + stats on the left, the written read and cards on the right.
 */
export default function Loading() {
  return (
    <Screen width="wide" className="flex flex-col gap-10">
      <p role="status" className="sr-only">
        Loading your profile
      </p>
      <div>
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-3 h-9 w-64 max-w-full" />
      </div>
      <div className="flex flex-col gap-10 lg:grid lg:grid-cols-5 lg:items-start lg:gap-8">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Skeleton className="h-44 w-full rounded-card" />
          <div className="grid grid-cols-4 gap-3">
            <Skeleton className="h-16 rounded-card" />
            <Skeleton className="h-16 rounded-card" />
            <Skeleton className="h-16 rounded-card" />
            <Skeleton className="h-16 rounded-card" />
          </div>
        </div>
        <div className="flex flex-col gap-10 lg:col-span-3">
          <div className="border-l-2 border-line pl-6">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="mt-2 h-6 w-5/6" />
            <Skeleton className="mt-2 h-6 w-2/3" />
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <Skeleton className="h-48 rounded-card" />
            <Skeleton className="h-48 rounded-card" />
          </div>
          <Skeleton className="h-28 w-full rounded-card" />
        </div>
      </div>
    </Screen>
  );
}
