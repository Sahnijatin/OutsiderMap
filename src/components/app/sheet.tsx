"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { easeOutExpo } from "@/components/motion/primitives";
import { trapTab } from "@/lib/a11y/focus-trap";
import { cn } from "@/lib/utils";

/**
 * THE bottom sheet. One implementation of the dialog contract so no surface
 * half-does it again: role=dialog + aria-modal labelled by its title, focus
 * moves in on open and back to the opener on close, Tab cycles inside,
 * Escape and the backdrop both close, the scroll area contains overscroll
 * (no pull-to-refresh through a sheet), the close target is 44px, the panel
 * pads for the home indicator, and the slide-up collapses to a fade under
 * reduced motion. Dependency-free beyond motion/react, which the repo ships.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion() ?? false;
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Focus management: remember the opener, move focus into the panel after it
  // mounts, and hand focus back when the sheet closes or unmounts.
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      cancelAnimationFrame(raf);
      openerRef.current?.focus();
    };
  }, [open]);

  // Escape closes; Tab is trapped to the panel (a simple cycle is enough for
  // a single modal layer - the app never stacks sheets).
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !panelRef.current) return;
    trapTab(panelRef.current, e);
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[1000]" onKeyDown={onKeyDown}>
          <motion.button
            type="button"
            aria-label="Close"
            tabIndex={-1}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-night/70 backdrop-blur-sm"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={reduced ? { opacity: 0 } : { y: "100%" }}
            animate={reduced ? { opacity: 1 } : { y: 0 }}
            exit={reduced ? { opacity: 0 } : { y: "100%" }}
            transition={{ duration: reduced ? 0.15 : 0.4, ease: easeOutExpo }}
            className={cn(
              "absolute inset-x-0 bottom-0 mx-auto flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-card border border-b-0 border-line bg-surface",
              className,
            )}
          >
            <header className="flex items-center justify-between gap-3 pl-5 pr-2 pt-3">
              <h2
                id={titleId}
                className="min-w-0 truncate font-display text-xl italic"
              >
                {title}
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink-dim transition-colors hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </header>
            <div className="overscroll-contain min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(var(--safe-bottom)+1.5rem)] pt-2">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
