"use client";

import { Share2 } from "lucide-react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { useState } from "react";
import { formatOutsiderNumber } from "@/lib/identity/username";
import { shareOrCopy } from "@/lib/native/share";

/**
 * The member's collectible: outsider number, @username, member-since. The
 * share button is the invite loop - the native sheet where available, a
 * clipboard fallback everywhere else. Desktop gets a subtle pointer tilt.
 */
export function IdentityCard({
  username,
  outsiderNumber,
  displayName,
  memberSince,
  cityName,
}: {
  username: string | null;
  outsiderNumber: number | null;
  displayName: string | null;
  memberSince: string;
  cityName: string;
}) {
  const reduced = useReducedMotion() ?? false;
  const [copied, setCopied] = useState(false);

  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(my, [0, 1], [4, -4]), {
    stiffness: 200,
    damping: 25,
  });
  const rotateY = useSpring(useTransform(mx, [0, 1], [-4, 4]), {
    stiffness: 200,
    damping: 25,
  });

  const number = formatOutsiderNumber(outsiderNumber);
  const since = new Date(memberSince).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  async function share() {
    const url = `https://www.outsidermap.com/?ref=${encodeURIComponent(username ?? "")}`;
    const text = `I'm outsider ${number} on OutsiderMap. ${cityName}, off the beaten map.`;
    // Native OS share sheet in the app, Web Share on the web, clipboard last.
    const outcome = await shareOrCopy({ text, url });
    if (outcome === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <motion.div
      style={reduced ? undefined : { rotateX, rotateY, transformPerspective: 900 }}
      onPointerMove={(e) => {
        if (reduced || e.pointerType !== "mouse") return;
        const rect = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - rect.left) / rect.width);
        my.set((e.clientY - rect.top) / rect.height);
      }}
      onPointerLeave={() => {
        mx.set(0.5);
        my.set(0.5);
      }}
      className="relative overflow-hidden rounded-card border border-accent/40 bg-surface p-6"
    >
      <div className="halo absolute -inset-10" />
      <div className="relative flex flex-col gap-1.5">
        <p className="voice text-accent">outsider {number}</p>
        <p className="font-display text-2xl italic">
          {username ? `@${username}` : (displayName ?? "you")}
        </p>
        <p className="font-mono text-xs text-ink-dim">
          {cityName} · member since {since}
        </p>
        <button
          type="button"
          onClick={() => void share()}
          className="mt-4 flex w-fit items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-medium text-night transition-transform hover:-translate-y-0.5"
        >
          <Share2 className="size-4" />
          {copied ? "Copied your card" : "Invite friends"}
        </button>
      </div>
    </motion.div>
  );
}
