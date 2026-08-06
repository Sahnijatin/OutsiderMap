import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one tip pattern, used on every screen of the first run.
 *
 * Markup is the soft callout the app already uses elsewhere - a full-strength
 * line border over a lifted surface - rather than a new tinted box: globals.css
 * is explicit that borders are never diluted, and the brand book reserves the
 * accent for things that want a tap. A tip wants to be read, not clicked.
 *
 * A server component on purpose. It has no state and no motion of its own; on
 * the quiz it rides the parent's AnimatePresence, and on the static screens it
 * rides `.om-rise-in`. Making it a client component to animate it would cost
 * more than the animation is worth.
 */
export function ProTip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <aside
      aria-label="Pro tip"
      className={cn(
        "rounded-card border border-line bg-raise/40 p-4",
        className,
      )}
    >
      {/* Decorative: the aside is already labelled, so announcing the eyebrow
          too would read the words "pro tip" twice. Lowercase in source because
          `.voice` uppercases in CSS. */}
      <p className="voice" aria-hidden>
        pro tip
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">{children}</p>
    </aside>
  );
}
