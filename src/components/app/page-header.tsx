import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The brand header pattern, applied identically on every screen: mono `.voice`
 * eyebrow above, the Fraunces-italic payoff line as the h1, an optional lead
 * paragraph, and a right-side action slot. This is the one h1 style in the
 * app - pages never roll their own.
 */
export function PageHeader({
  eyebrow,
  title,
  lead,
  action,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-end justify-between gap-4",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && <p className="voice">{eyebrow}</p>}
        <h1 className="mt-1 text-balance font-display text-3xl italic lg:text-4xl">
          {title}
        </h1>
        {lead && (
          <p className="mt-2 max-w-prose text-pretty text-sm leading-relaxed text-ink-dim">
            {lead}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
