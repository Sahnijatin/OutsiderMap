import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-line border-t-accent",
        className,
      )}
    />
  );
}

/**
 * A shimmer placeholder block. Decorative by definition (the surface's
 * loading.tsx announces itself), so it is aria-hidden; the pulse rests to a
 * static block under prefers-reduced-motion.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-xl bg-raise motion-reduce:animate-none",
        className,
      )}
    />
  );
}
