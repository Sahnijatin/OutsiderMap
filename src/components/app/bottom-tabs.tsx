"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/components/app/nav-items";
import { tap } from "@/lib/native/haptics";
import { cn } from "@/lib/utils";

/**
 * The app's primary navigation: a phone-first bottom tab bar. Floats over
 * full-bleed surfaces (the map), so it always carries its own backdrop.
 * Anonymous explorers (#116) get "Sign in" where signed-in members get "You".
 */
export function BottomTabs({ signedIn = true }: { signedIn?: boolean }) {
  const pathname = usePathname();

  const items = NAV_ITEMS.map((item) =>
    !signedIn && item.href === "/profile"
      ? { ...item, href: "/sign-in", label: "Sign in" }
      : item,
  );

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line/60 bg-night/85 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex h-16 max-w-lg items-stretch justify-around">
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
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
              <Icon
                className={cn(
                  "size-5 transition-transform duration-200 ease-out",
                  active && "motion-safe:scale-110",
                )}
                strokeWidth={active ? 2.2 : 1.8}
              />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
