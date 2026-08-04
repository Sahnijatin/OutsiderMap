import { Screen } from "@/components/app/screen";
import { Skeleton } from "@/components/ui/spinner";

/** A paragraph's worth of lines, last one short like real prose. */
function ParagraphSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  );
}

/**
 * Blog skeleton: the same narrow Screen as the real page, with the title,
 * byline, anchor-place card and prose in the order they land.
 */
export default function Loading() {
  return (
    <Screen width="narrow">
      <p role="status" className="sr-only">
        Loading the blog
      </p>
      <Skeleton className="mb-3 h-4 w-16" />
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-11/12" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-[4.5rem] w-full rounded-card" />
        <ParagraphSkeleton />
        <ParagraphSkeleton />
      </div>
    </Screen>
  );
}
