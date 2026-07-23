"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { NAV_ITEMS } from "@/components/app/nav-items";
import { formatOutsiderNumber } from "@/lib/identity/username";
import { cn } from "@/lib/utils";

/**
 * Desktop navigation: a fixed left rail, hidden below lg. The bottom tabs
 * own phones; this owns laptops. Width comes from --rail-w so full-bleed
 * surfaces (map, reels) can offset themselves with the same variable.
 */
export function SideRail({
  username,
  outsiderNumber,
  cityName,
  signedIn = true,
}: {
  username: string | null;
  outsiderNumber: number | null;
  cityName: string;
  /** Anonymous explorers (#116) get a sign-in card instead of the profile. */
  signedIn?: boolean;
}) {
  const pathname = usePathname();
  const reduced = useReducedMotion() ?? false;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-y-0 left-0 z-40 hidden w-[var(--rail-w)] flex-col border-r border-line/60 bg-night/85 backdrop-blur-md lg:flex"
    >
      <Link href="/map" className="px-6 pb-2 pt-7">
        <span className="font-display text-xl italic">OutsiderMap</span>
        <span className="voice mt-1.5 block">{cityName}</span>
      </Link>

      <div className="mt-6 flex flex-1 flex-col gap-1 px-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "text-accent" : "text-ink-dim hover:bg-raise/60 hover:text-ink",
              )}
            >
              {active && (
                <motion.span
                  layoutId={reduced ? undefined : "rail-active"}
                  className="absolute inset-0 rounded-xl border border-accent/25 bg-accent/10"
                  transition={{ type: "spring", stiffness: 400, damping: 34 }}
                />
              )}
              <Icon
                className="relative size-5"
                strokeWidth={active ? 2.2 : 1.8}
              />
              <span className="relative">{label}</span>
            </Link>
          );
        })}
      </div>

      {signedIn ? (
        <Link
          href="/profile"
          className="group mx-3 mb-5 flex flex-col gap-0.5 rounded-xl border border-line/60 bg-surface/70 px-4 py-3 transition-colors hover:border-accent/40"
        >
          <span className="voice text-accent">
            outsider {formatOutsiderNumber(outsiderNumber)}
          </span>
          <span className="truncate text-sm text-ink-dim transition-colors group-hover:text-ink">
            {username ? `@${username}` : "your profile"}
          </span>
        </Link>
      ) : (
        <Link
          href="/sign-in"
          className="group mx-3 mb-5 flex flex-col gap-0.5 rounded-xl border border-accent/40 bg-surface/70 px-4 py-3 transition-colors hover:border-accent/70"
        >
          <span className="voice text-accent">explore free</span>
          <span className="truncate text-sm text-ink-dim transition-colors group-hover:text-ink">
            Sign in to save &amp; get your taste
          </span>
        </Link>
      )}
    </nav>
  );
}
