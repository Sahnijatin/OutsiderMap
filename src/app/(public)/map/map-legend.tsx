"use client";

import { ChevronDown, Layers } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { MapCategory } from "@/lib/map/categories";

/**
 * The map key: one swatch per category, so the colored dots decode at a glance.
 * Categories are admin-managed (`map_categories`), passed in from the map page.
 * Collapsible - open by default on lg+ where there's room, a single pill on
 * phones so it never eats the map.
 */
export function MapLegend({ categories }: { categories: MapCategory[] }) {
  const [open, setOpen] = useState(true);

  if (categories.length === 0) return null;

  return (
    <div
      className="absolute bottom-6 left-4 z-[400]"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}
    >
      <div className="overflow-hidden rounded-card border border-line/80 bg-surface/90 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
        >
          <Layers className="size-4 shrink-0 text-accent" />
          <span className="voice flex-1">Legend</span>
          <ChevronDown
            className={cn(
              "size-4 text-ink-dim transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>

        <ul
          className={cn(
            "grid transition-all duration-300 ease-[var(--ease-out-expo)]",
            open
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0",
          )}
        >
          <li className="min-h-0 overflow-hidden">
            <div className="flex flex-col gap-2 border-t border-line/60 px-3.5 pb-3 pt-2.5">
              {categories.map((category) => (
                <div key={category.id} className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="size-3 shrink-0 rounded-full ring-1 ring-black/30"
                    style={{ background: category.color }}
                  />
                  <span className="text-xs text-ink-dim">{category.label}</span>
                </div>
              ))}
            </div>
          </li>
        </ul>
      </div>
    </div>
  );
}
