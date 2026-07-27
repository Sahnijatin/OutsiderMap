import { Screen } from "@/components/app/screen";
import { Skeleton } from "@/components/ui/spinner";

/**
 * Place page skeleton: back link, the hero at its real aspect ratio (so the
 * cover lands without a jump), the action row, then text blocks.
 */
export default function Loading() {
  return (
    <Screen>
      <p role="status" className="sr-only">
        Loading place
      </p>
      <Skeleton className="h-4 w-14" />
      <Skeleton className="mt-4 aspect-[16/10] w-full rounded-card sm:aspect-[2/1]" />
      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <Skeleton className="h-10 w-56 rounded-full" />
        <Skeleton className="h-10 w-32 rounded-full" />
      </div>
      <div className="mt-8">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-5/6" />
        <Skeleton className="mt-2 h-4 w-2/3" />
      </div>
      <div className="mt-8 flex gap-1.5">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-14 rounded-full" />
      </div>
    </Screen>
  );
}
