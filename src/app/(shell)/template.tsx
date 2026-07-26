"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Per-navigation enter transition for every shell page. Opacity ONLY:
 * the map main is position: fixed, and a transformed ancestor
 * re-scopes fixed children - a translate here would visibly shift them. That
 * constraint is real, so this stays a fade.
 *
 * It is a *short* fade though. At 300ms this was long enough to read as "the
 * page is still loading" and added a third of a second of felt lag to every
 * navigation; 150ms still softens the swap without being something you wait on.
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
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
