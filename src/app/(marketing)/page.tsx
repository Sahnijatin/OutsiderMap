"use client";

import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { fadeUp, stagger } from "@/components/motion/primitives";

const HeroScene = dynamic(() => import("@/components/three/HeroScene"), {
  ssr: false,
});

export default function LandingPage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6">
      <div className="absolute inset-0 opacity-40">
        <HeroScene />
      </div>

      <motion.div
        className="relative z-10 flex max-w-2xl flex-col items-center gap-6 text-center"
        variants={stagger}
        initial="hidden"
        animate="visible"
      >
        <motion.p
          variants={fadeUp}
          className="font-mono text-xs uppercase tracking-[0.3em] text-ink-dim"
        >
          Delhi · 3:00 AM
        </motion.p>

        <motion.h1
          variants={fadeUp}
          className="font-display text-5xl leading-tight sm:text-7xl"
        >
          Your city, <span className="italic text-accent">your taste.</span>
        </motion.h1>

        <motion.p variants={fadeUp} className="max-w-md text-lg text-ink-dim">
          Tell us your mood. We already know your taste. One confident answer
          for where to go and what to do — not ten thousand options.
        </motion.p>

        <motion.p
          variants={fadeUp}
          className="font-mono text-xs text-ink-dim/60"
        >
          Rebuilding. Coming soon.
        </motion.p>
      </motion.div>
    </main>
  );
}
