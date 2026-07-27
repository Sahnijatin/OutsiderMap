import { Screen } from "@/components/app/screen";
import { Skeleton } from "@/components/ui/spinner";

/** One post-card-shaped placeholder: header, body line, media, count row. */
function PostSkeleton({ media = true }: { media?: boolean }) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex items-center gap-3 px-4 pt-4">
        <Skeleton className="size-9 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-12" />
        </div>
      </div>
      <div className="px-4 py-3">
        <Skeleton className="h-6 w-40 rounded-full" />
        <Skeleton className="mt-2.5 h-4 w-3/4" />
      </div>
      {media && <Skeleton className="aspect-[4/3] w-full rounded-none" />}
      <div className="flex items-center gap-5 px-4 py-3">
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-4 w-10" />
      </div>
    </div>
  );
}

/**
 * Feed skeleton: the same narrow Screen and sticky tab bar geometry as the
 * real page, with post-card-shaped placeholders where content will land.
 */
export default function Loading() {
  return (
    <Screen width="narrow">
      <p role="status" className="sr-only">
        Loading the feed
      </p>
      <div className="sticky top-0 z-10 -mx-5 mb-4 -mt-[var(--safe-top)] flex items-center gap-1 border-b border-line bg-night/85 px-5 pb-2 pt-[calc(var(--safe-top)+0.5rem)] backdrop-blur-md">
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="ml-auto size-9 rounded-full" />
      </div>
      <div className="flex flex-col gap-4">
        <PostSkeleton />
        <PostSkeleton media={false} />
        <PostSkeleton />
      </div>
    </Screen>
  );
}
