"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ButtonLink } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatOutsiderNumber } from "@/lib/identity/username";
import { easeOutExpo } from "@/components/motion/primitives";

// The signature scene - ten thousand lights collapsing to one - is the beat.
const ConvergenceField = dynamic(
  () => import("@/components/three/ConvergenceField"),
  { ssr: false },
);

type ActivationPick = {
  id: string;
  slug: string;
  name: string;
  area: string | null;
  image: string | null;
  reason: string;
};

type Phase = "reading" | "reveal" | "empty";

/**
 * The activation beat (#121): the field converges while we read the member's
 * taste into one confident first answer, then the answer resolves out of the
 * light. A minimum dwell keeps the moment cinematic even when the API is fast;
 * under reduced motion it resolves immediately with no theatrics.
 */
export function ActivationReveal({
  username,
  outsiderNumber,
}: {
  username: string | null;
  outsiderNumber: number | null;
}) {
  const reduced = useReducedMotion() ?? false;
  const [phase, setPhase] = useState<Phase>("reading");
  const [pick, setPick] = useState<ActivationPick | null>(null);
  const [answerId, setAnswerId] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const minDwell = reduced ? 0 : 2600;
    const startedAt = Date.now();
    (async () => {
      let data: {
        answerId?: string;
        pick?: ActivationPick | null;
        degraded?: boolean;
      } | null = null;
      try {
        const res = await fetch("/api/activation", { method: "POST" });
        if (res.ok) data = await res.json();
      } catch {
        // Network hiccup - fall through to the graceful welcome.
      }
      const wait = Math.max(0, minDwell - (Date.now() - startedAt));
      window.setTimeout(() => {
        if (data?.pick) {
          setPick(data.pick);
          setAnswerId(data.answerId ?? null);
          setDegraded(data.degraded === true);
          setPhase("reveal");
        } else {
          setPhase("empty");
        }
      }, wait);
    })();
  }, [reduced]);

  // A click on the first answer is a precise acceptance (#120), tied to the
  // exact served answer; navigation to the place proceeds regardless.
  function acceptFirstAnswer() {
    if (!pick || !answerId) return;
    void fetch("/api/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "rec_click",
        placeId: pick.id,
        answerId,
      }),
    }).catch(() => {});
  }

  const enter = reduced
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.7, ease: easeOutExpo },
      };

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-night px-6 text-center">
      <div className="absolute inset-0 opacity-60">
        <ConvergenceField />
      </div>
      <div className="halo absolute inset-0" />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-6">
        <p className="voice text-accent">
          outsider {formatOutsiderNumber(outsiderNumber)}
          {username ? ` · @${username}` : ""}
        </p>

        {phase === "reading" && (
          <div className="flex flex-col items-center gap-3">
            <p className="font-display text-2xl italic text-ink">
              Reading ten thousand corners of the city…
            </p>
            <Spinner className="size-5 text-accent" />
          </div>
        )}

        {phase === "reveal" && pick && (
          <motion.div {...enter} className="flex flex-col items-center gap-5">
            {/* "We read you" is only true when the taste pipeline actually ran;
                the degraded fallback gets an honest, quieter framing. */}
            <p className="font-display text-2xl italic text-ink">
              {degraded ? "Start here." : "We read you. Start here."}
            </p>
            {degraded && (
              <p className="text-xs italic text-ink-dim">
                A quick pick while the concierge is out - not personalized yet.
              </p>
            )}

            <Link
              href={`/map?place=${encodeURIComponent(pick.slug)}`}
              onClick={acceptFirstAnswer}
              className="group flex w-full flex-col overflow-hidden rounded-card border border-line bg-surface/80 text-left backdrop-blur transition-colors hover:border-accent/60"
            >
              {pick.image && (
                <Image
                  src={pick.image}
                  alt=""
                  width={800}
                  height={320}
                  sizes="(max-width: 640px) 100vw, 640px"
                  className="h-40 w-full object-cover"
                />
              )}
              <div className="flex flex-col gap-1.5 p-4">
                <span className="font-display text-xl text-ink">
                  {pick.name}
                </span>
                {pick.area && (
                  <span className="voice text-ink-dim">{pick.area}</span>
                )}
                {pick.reason && (
                  <p className="mt-1 text-sm text-ink-dim">{pick.reason}</p>
                )}
                <span className="mt-2 text-sm text-accent group-hover:underline">
                  Take me there →
                </span>
              </div>
            </Link>

            <Link
              href="/map?welcome=1"
              className="text-sm text-ink-dim transition-colors hover:text-ink"
            >
              See your whole city
            </Link>
          </motion.div>
        )}

        {phase === "empty" && (
          <motion.div {...enter} className="flex flex-col items-center gap-5">
            <p className="font-display text-2xl italic text-ink">
              Your city&rsquo;s ready.
            </p>
            <p className="max-w-xs text-sm text-ink-dim">
              Ask for anything - a late dinner, a quiet corner, somewhere new -
              and we&rsquo;ll answer with one place, not a list.
            </p>
            <ButtonLink href="/map?welcome=1" size="lg">
              Step in →
            </ButtonLink>
          </motion.div>
        )}
      </div>
    </main>
  );
}
