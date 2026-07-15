"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clapperboard,
  Compass,
  MapIcon,
  MessageCircle,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/map", label: "Map", icon: MapIcon },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/quests", label: "Quests", icon: Compass },
  { href: "/reels", label: "Reels", icon: Clapperboard },
  { href: "/profile", label: "You", icon: UserRound },
] as const;

/**
 * The app's primary navigation: a phone-first bottom tab bar. Floats over
 * full-bleed surfaces (the map), so it always carries its own backdrop.
 */
export function BottomTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line/60 bg-night/85 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex h-16 max-w-lg items-stretch justify-around">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 text-[0.65rem] font-medium transition-colors",
                active ? "text-accent" : "text-ink-dim hover:text-ink",
              )}
            >
              <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
