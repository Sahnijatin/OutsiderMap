import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The one empty-state pattern: a centered card with room for a CTA. An empty
 * surface is a dead end unless it says what to do next, so `action` should
 * almost always be passed - a real button to the screen that fills this one.
 */
export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "flex flex-col items-center gap-3 px-6 py-10 text-center",
        className,
      )}
    >
      <p className="text-balance font-display text-xl italic">{title}</p>
      {body && (
        <p className="mx-auto max-w-sm text-pretty text-sm leading-relaxed text-ink-dim">
          {body}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </Card>
  );
}
