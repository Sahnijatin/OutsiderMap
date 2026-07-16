"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Per-navigation enter transition for every shell page. Opacity ONLY:
 * the map and reels mains are position: fixed, and a transformed ancestor
 * re-scopes fixed children - a translate here would visibly shift them.
 */
export default function ShellTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion() ?? false;

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
