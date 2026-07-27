import { Screen } from "@/components/app/screen";
import { Skeleton } from "@/components/ui/spinner";

/**
 * Generic shell skeleton: the fallback for any (shell) route without a
 * tailored loading.tsx. Same Screen container as the real pages, so content
 * lands without a jump: header shape up top, card-shaped blocks below.
 */
export default function Loading() {
  return (
    <Screen>
      <p role="status" className="sr-only">
        Loading
      </p>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-9 w-2/3 max-w-sm" />
      <div className="mt-8 flex flex-col gap-3">
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-24 w-full rounded-card" />
      </div>
    </Screen>
  );
}
