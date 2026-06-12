import type { Transition, Variants } from "motion/react";

export const easeOutExpo = [0.16, 1, 0.3, 1] as const;

export const defaultTransition: Transition = {
  duration: 0.8,
  ease: easeOutExpo,
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: defaultTransition },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: defaultTransition },
};

export const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};

/** Slower stagger for full-section reveals. */
export const staggerSlow: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.18, delayChildren: 0.15 } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: defaultTransition },
};
