import { Screen } from "@/components/app/screen";
import { Skeleton } from "@/components/ui/spinner";

/** Market runs skeleton: header plus run rows (title, meta, status pill). */
export default function Loading() {
  return (
    <Screen>
      <p role="status" className="sr-only">
        Loading shopping runs
      </p>
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-3 h-9 w-72 max-w-full" />
      <div className="mt-6 flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-4"
          >
            <div className="flex min-w-0 flex-col gap-1.5">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </Screen>
  );
}
