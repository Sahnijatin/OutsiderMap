"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";

const QUERY = "it’s 3am. i want quiet, parathas, and to not see anyone i know";

const WHY_LINES = [
  "Greasy enough to fix the night.",
  "Open when nothing else is.",
  "Far enough from your usual circuit that nobody will find you.",
];

/**
 * A staged mock of the Right Now surface: the query types itself, then the
 * answer streams in - the product, demonstrated instead of described.
 */
export function Demo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.45 });
  const reduced = useReducedMotion() ?? false;
  const [typed, setTyped] = useState(reduced ? QUERY : "");
  const [answered, setAnswered] = useState(reduced);

  useEffect(() => {
    if (!inView || reduced) return;
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setTyped(QUERY.slice(0, i));
      if (i >= QUERY.length) {
        clearInterval(interval);
        setTimeout(() => setAnswered(true), 450);
      }
    }, 34);
    return () => clearInterval(interval);
  }, [inView, reduced]);

  return (
    <section className="relative mx-auto max-w-5xl px-6 py-28">
      <div className="halo absolute inset-x-0 top-1/3 h-96" />
      <div className="relative" ref={ref}>
        <p className="voice">Right now mode · free</p>
        <h2 className="mt-4 max-w-2xl font-display text-3xl sm:text-5xl">
          Ask at 3am. <span className="italic text-accent">Mean it.</span>
        </h2>

        <div className="mt-14 overflow-hidden rounded-card border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <span className="font-mono text-xs text-ink-dim">
              outsidermap · right now
            </span>
            <span className="font-mono text-xs text-ink-dim">03:02 IST</span>
          </div>

          <div className="flex flex-col gap-6 p-6 sm:p-8">
            <p className="font-mono text-sm leading-relaxed text-ink">
              <span aria-hidden className="text-accent">&gt; </span>
              {typed}
              {!answered && inView && (
                <span aria-hidden className="animate-pulse text-accent">▍</span>
              )}
            </p>

            {answered && (
              <motion.div
                initial={reduced ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-xl border border-line bg-night p-5 sm:p-6"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="font-display text-2xl">
                    Moolchand Parathewala
                  </h3>
                  <span className="text-sm text-ink-dim">
                    Lajpat Nagar · open now · ₹
                  </span>
                </div>
                <ul className="mt-4 flex flex-col gap-2">
                  {WHY_LINES.map((line, i) => (
                    <motion.li
                      key={line}
                      initial={reduced ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: reduced ? 0 : 0.5 + i * 0.55 }}
                      className="text-sm leading-relaxed text-ink-dim"
                    >
                      <span aria-hidden className="mr-2 text-accent">·</span>
                      {line}
                    </motion.li>
                  ))}
                </ul>
                <motion.div
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: reduced ? 0 : 2.3 }}
                  className="mt-5"
                >
                  <Badge variant="accent">matched to your profile</Badge>
                </motion.div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
