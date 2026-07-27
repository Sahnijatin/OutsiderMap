import { Screen } from "@/components/app/screen";
import { Skeleton } from "@/components/ui/spinner";

/** Activity skeleton: back link, header, then avatar + line rows. */
export default function Loading() {
  return (
    <Screen width="narrow">
      <p role="status" className="sr-only">
        Loading activity
      </p>
      <Skeleton className="mb-3 h-4 w-16" />
      <div className="mb-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-9 w-40" />
      </div>
      <ul className="flex flex-col">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <li key={i} className="border-b border-line/40 py-3 last:border-0">
            <div className="flex items-center gap-3 px-2">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <Skeleton className="h-4 min-w-0 flex-1" />
              <Skeleton className="h-3 w-8 shrink-0" />
            </div>
          </li>
        ))}
      </ul>
    </Screen>
  );
}
