"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/now", label: "Right Now" },
  { href: "/weekend", label: "Weekend" },
  { href: "/events", label: "Events" },
  { href: "/saved", label: "Saved" },
];

export function AppNav({
  displayName,
  isAdmin,
}: {
  displayName: string | null;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const initial = (displayName ?? "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line/60 bg-night/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-6">
        <Link href="/now" className="font-display text-lg italic">
          OutsiderMap
        </Link>

        <div className="flex flex-1 items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const active =
              pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors",
                  active
                    ? "bg-raise text-ink"
                    : "text-ink-dim hover:text-ink",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              href="/admin"
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors",
                pathname.startsWith("/admin")
                  ? "bg-raise text-ink"
                  : "text-ink-dim hover:text-ink",
              )}
            >
              Admin
            </Link>
          )}
        </div>

        <Link
          href="/profile"
          aria-label="Your profile"
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full border text-sm transition-colors",
            pathname.startsWith("/profile")
              ? "border-accent text-accent"
              : "border-line text-ink-dim hover:border-ink-dim hover:text-ink",
          )}
        >
          {initial}
        </Link>
      </nav>
    </header>
  );
}
