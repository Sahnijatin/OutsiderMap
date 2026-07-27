"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { easeOutExpo } from "@/components/motion/primitives";
import { cn } from "@/lib/utils";

/**
 * A slim top banner for connectivity: slides down when the network drops,
 * shows a brief "Back online" beat on reconnect, then slides away. Announced
 * politely for screen readers, padded for the notch, transform/opacity only,
 * and reduced motion swaps the slide for a fade.
 */

type NetState = "online" | "offline" | "reconnected";

export function OfflineBanner() {
  const [state, setState] = useState<NetState>("online");
  const reduced = useReducedMotion() ?? false;

  useEffect(() => {
    const goOffline = () => setState("offline");
    const goOnline = () =>
      setState((s) => (s === "offline" ? "reconnected" : s));
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    // Pages can load while already offline - check once, off the render pass.
    const raf = requestAnimationFrame(() => {
      if (!navigator.onLine) goOffline();
    });
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      cancelAnimationFrame(raf);
    };
  }, []);

  // "Back online" holds for a beat, then the banner slides away.
  useEffect(() => {
    if (state !== "reconnected") return;
    const timer = setTimeout(() => setState("online"), 2200);
    return () => clearTimeout(timer);
  }, [state]);

  const show = state !== "online";

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-50"
    >
      <AnimatePresence>
        {show && (
          <motion.div
            initial={reduced ? { opacity: 0 } : { y: "-100%", opacity: 0 }}
            animate={reduced ? { opacity: 1 } : { y: 0, opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { y: "-100%", opacity: 0 }}
            transition={{ duration: 0.35, ease: easeOutExpo }}
            className={cn(
              "flex items-center justify-center gap-2 border-b px-4 pb-2 text-xs backdrop-blur",
              state === "reconnected"
                ? "border-accent/30 bg-night/95 text-accent"
                : "border-line bg-night/95 text-ink-dim",
            )}
            style={{ paddingTop: "calc(var(--safe-top) + 0.5rem)" }}
          >
            {state === "reconnected" ? (
              "Back online"
            ) : (
              <>
                <WifiOff aria-hidden className="size-3.5" />
                Offline - the city will wait
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
