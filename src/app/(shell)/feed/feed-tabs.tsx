"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { cn } from "@/lib/utils";
import { FEED_TABS, type FeedTab } from "@/lib/feed/read";

const TAB_LABEL: Record<FeedTab, string> = { home: "Home", discover: "Discover" };

/**
 * The feed's sticky tab bar. Tabs are URL state (/feed?tab=discover) pushed
 * through the router, so the choice is linkable and survives refresh; the
 * optimistic highlight acknowledges the tap instantly while the server page
 * renders.
 */
export function FeedTabs({ active }: { active: FeedTab }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(active);

  function switchTab(tab: FeedTab) {
    if (tab === active) return;
    startTransition(() => {
      setOptimistic(tab);
      router.push(tab === "home" ? "/feed" : `/feed?tab=${tab}`, {
        scroll: true,
      });
    });
  }

  return (
    // The bar starts below the notch (the negative margin cancels the
    // screen's safe-top padding), then re-pads itself so the blurred
    // background covers the notch once it sticks.
    <div
      role="tablist"
      aria-label="Feed"
      className="sticky top-0 z-10 -mx-5 mb-4 -mt-[var(--safe-top)] flex items-center gap-1 border-b border-line bg-night/85 px-5 pb-2 pt-[calc(var(--safe-top)+0.5rem)] backdrop-blur-md"
    >
      {FEED_TABS.map((t) => (
        <button
          key={t}
          role="tab"
          aria-selected={optimistic === t}
          onClick={() => switchTab(t)}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            optimistic === t
              ? "bg-accent/10 text-accent"
              : "text-ink-dim hover:text-ink",
          )}
        >
          {TAB_LABEL[t]}
        </button>
      ))}
      <Link
        href="/activity"
        aria-label="Activity"
        className="ml-auto flex size-9 items-center justify-center rounded-full text-ink-dim hover:text-ink"
      >
        <Bell className="size-5" />
      </Link>
    </div>
  );
}
