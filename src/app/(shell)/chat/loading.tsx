import { Screen } from "@/components/app/screen";
import { Skeleton } from "@/components/ui/spinner";

/**
 * Chat skeleton: the same full-bleed split-pane geometry as the shell -
 * history sidebar on lg+, a conversation column with bubbles, and the
 * composer bar pinned to the bottom.
 */
export default function Loading() {
  return (
    <Screen
      inset={false}
      className="h-dvh pb-[var(--tab-clearance)] lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]"
    >
      <p role="status" className="sr-only">
        Loading chat
      </p>
      <aside className="hidden h-full flex-col gap-2 overflow-hidden border-r border-line bg-surface/30 p-4 lg:flex">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </aside>
      <div className="mx-auto flex h-full w-full max-w-lg flex-col px-5 pt-[calc(var(--safe-top)+1.5rem)] lg:max-w-2xl">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="size-9 rounded-full" />
        </div>
        <div className="mt-8 flex flex-1 flex-col gap-4">
          <Skeleton className="h-16 w-3/4 self-start rounded-2xl" />
          <Skeleton className="h-10 w-1/2 self-end rounded-2xl" />
          <Skeleton className="h-24 w-3/4 self-start rounded-2xl" />
        </div>
        <Skeleton className="mb-4 h-12 w-full rounded-full" />
      </div>
    </Screen>
  );
}
