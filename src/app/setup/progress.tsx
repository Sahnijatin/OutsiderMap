import { TOTAL_SETUP_SCREENS } from "@/lib/setup/steps";
import { cn } from "@/lib/utils";

/**
 * The first-run progress bar, shared by every screen so the twelve screens
 * read as one flow rather than four detours and a quiz.
 *
 * The quiz's original dots were a fixed `w-6` each. Twelve of those plus their
 * gaps overflow a 360px phone, and the mobile-verify harness fails any page
 * that scrolls sideways - so these flex instead, capped at the old width so
 * the shape is unchanged on a wide screen.
 */
export function SetupProgress({
  index,
  total = TOTAL_SETUP_SCREENS,
  className,
}: {
  /** 0-based index of the current screen. */
  index: number;
  total?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("flex min-w-0 gap-1.5", className)}
      aria-label={`Screen ${index + 1} of ${total}`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1 min-w-1 max-w-6 flex-1 rounded-full transition-colors",
            i <= index ? "bg-accent" : "bg-line",
          )}
        />
      ))}
    </div>
  );
}
