"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { fadeUp, stagger, staggerSlow } from "@/components/motion/primitives";

/**
 * Scroll-into-view reveal. Wrap a section in <Reveal> and mark each
 * animated child with <RevealItem> - children stagger in once when the
 * section enters the viewport. speed="fast" suits dense lists; the default
 * slow cadence suits full marketing sections.
 */
export function Reveal({
  children,
  className,
  speed = "slow",
}: {
  children: ReactNode;
  className?: string;
  speed?: "slow" | "fast";
}) {
  return (
    <motion.div
      className={className}
      variants={speed === "fast" ? stagger : staggerSlow}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.25 }}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div className={className} variants={fadeUp}>
      {children}
    </motion.div>
  );
}
