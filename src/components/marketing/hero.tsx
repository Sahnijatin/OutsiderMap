"use client";

import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { ButtonLink } from "@/components/ui/button";
import { fadeUp, stagger } from "@/components/motion/primitives";

const ConvergenceField = dynamic(
  () => import("@/components/three/ConvergenceField"),
  { ssr: false },
);

export function Hero() {
  return (
    <section className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6">
      <div className="absolute inset-0 opacity-60">
        <ConvergenceField />
      </div>
      <div className="halo absolute inset-0" />

      <motion.div
        className="relative z-10 flex max-w-3xl flex-col items-center gap-7 text-center"
        variants={stagger}
        initial="hidden"
        animate="visible"
      >
        <motion.p variants={fadeUp} className="voice">
          Your city · 3:00 AM
        </motion.p>

        <motion.h1
          variants={fadeUp}
          className="font-display text-5xl leading-[1.05] sm:text-7xl"
        >
          Ten thousand places.
          <br />
          <span className="italic text-accent">One answer.</span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="max-w-xl text-lg leading-relaxed text-ink-dim"
        >
          OutsiderMap learns your taste - what you eat, where you sit, how
          late you stay - and turns &ldquo;it&rsquo;s 3am and I want
          something&rdquo; into exactly where to go.
        </motion.p>

        <motion.div
          variants={fadeUp}
          className="flex flex-col items-center gap-3 sm:flex-row"
        >
          <ButtonLink href="/join" size="lg">
            Join the waitlist
          </ButtonLink>
          <ButtonLink href="#how" variant="ghost" size="lg">
            See how it works
          </ButtonLink>
        </motion.div>

        <motion.p variants={fadeUp} className="font-mono text-xs text-ink-dim/60">
          Launching in Delhi, July 10 · every city soon
        </motion.p>
      </motion.div>
    </section>
  );
}
