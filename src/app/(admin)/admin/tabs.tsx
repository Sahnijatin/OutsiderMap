"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/admin", label: "Signals", exact: true },
  { href: "/admin/metrics", label: "Metrics" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/places", label: "Places" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/ingest", label: "Ingest" },
  { href: "/admin/harvest", label: "Harvest" },
  { href: "/admin/markets", label: "Markets" },
  { href: "/admin/photos", label: "Photos" },
  { href: "/admin/data", label: "Data" },
  { href: "/admin/moderation", label: "Moderation" },
  { href: "/admin/grievances", label: "Grievances" },
  { href: "/admin/scout", label: "Scout" },
  { href: "/admin/diagnostics", label: "Diagnostics" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors",
              active ? "bg-raise text-ink" : "text-ink-dim hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
