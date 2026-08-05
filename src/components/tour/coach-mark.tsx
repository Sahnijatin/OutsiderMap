"use client";

import { motion } from "motion/react";
import type { RefObject } from "react";
import { easeOutExpo } from "@/components/motion/primitives";
import { Button } from "@/components/ui/button";
import type { Placement, Side } from "@/lib/tour/geometry";
import type { TourStep } from "@/lib/tour/steps";
import { cn } from "@/lib/utils";

/**
 * The tour's anchored panel. Presentational only - it is told where to sit and
 * never measures anything itself.
 *
 * Chrome follows the settings-card idiom (rounded-card / border-line /
 * bg-surface, a .voice eyebrow, a Fraunces-italic title) so it reads as part
 * of the app rather than a bolted-on widget.
 */

/** Caret geometry per side. The square is rotated 45deg, so two adjacent
 *  borders form the arrowhead and the other two stay invisible. */
const CARET: Record<Side, string> = {
  bottom: "top-0 -translate-y-1/2 border-l border-t",
  top: "bottom-0 translate-y-1/2 border-r border-b",
  right: "left-0 -translate-x-1/2 border-b border-l",
  left: "right-0 translate-x-1/2 border-r border-t",
};

export function CoachMark({
  step,
  index,
  total,
  placement,
  reduced,
  panelRef,
  titleId,
  bodyId,
  onNext,
  onBack,
  onSkip,
}: {
  step: TourStep;
  index: number;
  total: number;
  /** Null until the first measure lands; the panel hides itself until then. */
  placement: Placement | null;
  reduced: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
  titleId: string;
  bodyId: string;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const isFirst = index === 0;
  const isLast = index === total - 1;

  return (
    <motion.div
      ref={panelRef}
      role="dialog"
      // Deliberately no aria-modal: the spotlit nav item stays interactive, so
      // claiming the rest of the page is inert would be a lie to assistive
      // tech. Every action here has a keyboard equivalent instead.
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      tabIndex={-1}
      initial={false}
      animate={{ opacity: placement ? 1 : 0 }}
      transition={{ duration: reduced ? 0 : 0.2, ease: easeOutExpo }}
      style={{ left: placement?.x ?? 0, top: placement?.y ?? 0 }}
      className={cn(
        "absolute w-[min(20rem,calc(100vw-1.5rem))] rounded-card border border-line bg-surface p-4 outline-none",
        !placement && "pointer-events-none",
      )}
    >
      {placement && (
        <span
          aria-hidden
          className={cn(
            "absolute size-3 rotate-45 bg-surface border-line",
            CARET[placement.side],
          )}
          style={
            placement.side === "top" || placement.side === "bottom"
              ? { left: placement.arrow, marginLeft: -6 }
              : { top: placement.arrow, marginTop: -6 }
          }
        />
      )}

      <p className="voice text-accent">
        Step {index + 1} of {total}
      </p>
      <h2 id={titleId} className="mt-1 font-display text-lg italic text-ink">
        {step.title}
      </h2>
      <p id={bodyId} className="mt-1 text-xs leading-relaxed text-ink-dim">
        {step.body}
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" onClick={onSkip}>
          Skip
        </Button>
        <div className="flex items-center gap-2">
          {!isFirst && (
            <Button variant="secondary" onClick={onBack}>
              Back
            </Button>
          )}
          <Button variant="primary" onClick={onNext}>
            {isLast ? "Finish" : "Next"}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
