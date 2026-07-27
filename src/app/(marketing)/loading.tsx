import { Skeleton } from "@/components/ui/spinner";

/** Simple marketing-page skeleton: a heading and a few paragraph blocks. */
export default function Loading() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-5 pb-24 pt-[calc(var(--safe-top)+4rem)]">
      <p role="status" className="sr-only">
        Loading
      </p>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-10 w-3/4 max-w-md" />
      <div className="mt-10 flex flex-col gap-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="mt-6 h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </main>
  );
}
