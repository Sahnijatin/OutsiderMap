"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { NAV_ITEMS } from "@/components/app/nav-items";
import { NAV_TOUR_IDS } from "@/lib/tour/anchors";
import { tap } from "@/lib/native/haptics";
import { cn } from "@/lib/utils";

/**
 * The app's primary navigation: a phone-first bottom tab bar. Floats over
 * full-bleed surfaces (the map), so it always carries its own backdrop.
 * Anonymous explorers (#116) get "Sign in" where signed-in members get "You".
 */
export function BottomTabs({ signedIn = true }: { signedIn?: boolean }) {
  const pathname = usePathname();
  const reduced = useReducedMotion() ?? false;

  // The tour anchor is keyed off the ORIGINAL href: the /profile -> /sign-in
  // swap below widens the type, and NAV_TOUR_IDS["/sign-in"] does not exist.
  const items = NAV_ITEMS.map((item) => ({
    ...(!signedIn && item.href === "/profile"
      ? { ...item, href: "/sign-in", label: "Sign in" }
      : item),
    tour: NAV_TOUR_IDS[item.href],
  }));

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-night/85 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex h-16 max-w-lg items-stretch justify-around">
        {items.map(({ href, label, icon: Icon, tour }) => {
          const active =
            pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              data-tour={tour}
              aria-current={active ? "page" : undefined}
              onClick={() => {
                // The tab bar is the most-tapped surface in the app; a tick of
                // haptic feedback is what separates "app" from "web page".
                // No-op on web, and never throws.
                if (!active) tap();
              }}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 text-[0.65rem] font-medium transition-colors",
                "active:opacity-70 motion-safe:transition-[color,opacity]",
                active ? "text-accent" : "text-ink-dim hover:text-ink",
              )}
            >
              {/* The active icon lands with a small spring - transform only,
                  and a plain snap under reduced motion. */}
              <motion.span
                className="flex"
                animate={{ scale: active ? 1.12 : 1 }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 480, damping: 24 }
                }
              >
                <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} />
              </motion.span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
