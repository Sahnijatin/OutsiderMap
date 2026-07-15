"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { CityOption, PlaceFeatureProps } from "./map-canvas";

type PlaceCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  PlaceFeatureProps
>;

type Result =
  | { type: "city"; label: string; sub: string; city: CityOption }
  | { type: "area"; label: string; sub: string; lng: number; lat: number }
  | {
      type: "place";
      label: string;
      sub: string;
      props: PlaceFeatureProps;
      lng: number;
      lat: number;
    };

/**
 * Search over what we actually have: live cities, areas (centroids computed
 * from the catalog itself), and place names. No external geocoder - if it's
 * not on the map, it's not in the search.
 */
export function MapSearch({
  cityName,
  cities,
  places,
  onCity,
  onArea,
  onPlace,
}: {
  cityName: string;
  cities: CityOption[];
  places: PlaceCollection;
  onCity: (city: CityOption) => void;
  onArea: (lng: number, lat: number) => void;
  onPlace: (props: PlaceFeatureProps, lng: number, lat: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const areas = useMemo(() => {
    const acc = new Map<string, { lng: number; lat: number; n: number }>();
    for (const f of places.features) {
      const area = f.properties.area;
      if (!area) continue;
      const [lng, lat] = f.geometry.coordinates;
      const cur = acc.get(area) ?? { lng: 0, lat: 0, n: 0 };
      acc.set(area, {
        lng: cur.lng + lng,
        lat: cur.lat + lat,
        n: cur.n + 1,
      });
    }
    return [...acc.entries()].map(([name, { lng, lat, n }]) => ({
      name,
      lng: lng / n,
      lat: lat / n,
      count: n,
    }));
  }, [places]);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: Result[] = [];
    for (const city of cities) {
      if (city.name.toLowerCase().includes(q)) {
        out.push({ type: "city", label: city.name, sub: "City", city });
      }
    }
    for (const area of areas) {
      if (area.name.toLowerCase().includes(q)) {
        out.push({
          type: "area",
          label: area.name,
          sub: `${area.count} place${area.count === 1 ? "" : "s"}`,
          lng: area.lng,
          lat: area.lat,
        });
      }
    }
    for (const f of places.features) {
      const p = f.properties;
      if (p.name.toLowerCase().includes(q)) {
        const [lng, lat] = f.geometry.coordinates;
        out.push({
          type: "place",
          label: p.name,
          sub: [p.area, p.kind].filter(Boolean).join(" · "),
          props: p,
          lng,
          lat,
        });
      }
      if (out.length >= 14) break;
    }
    return out.slice(0, 14);
  }, [query, cities, areas, places]);

  function pick(r: Result) {
    setOpen(false);
    setQuery("");
    if (r.type === "city") onCity(r.city);
    else if (r.type === "area") onArea(r.lng, r.lat);
    else onPlace(r.props, r.lng, r.lat);
  }

  return (
    <div
      className="absolute inset-x-4 z-20"
      style={{ top: "calc(env(safe-area-inset-top) + 0.75rem)" }}
    >
      <div className="mx-auto max-w-md">
        <div
          className={cn(
            "rounded-card border border-line/80 bg-surface/90 backdrop-blur-md transition-colors",
            open && "border-accent/50",
          )}
        >
          <div className="flex items-center gap-2 px-4">
            <Search className="size-4 shrink-0 text-ink-dim" />
            <input
              type="search"
              enterKeyHint="search"
              placeholder={`Search ${cityName} - places, areas…`}
              value={query}
              onFocus={() => setOpen(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              className="h-11 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-dim"
            />
            {open && (
              <button
                type="button"
                aria-label="Close search"
                onClick={() => {
                  setOpen(false);
                  setQuery("");
                }}
              >
                <X className="size-4 text-ink-dim" />
              </button>
            )}
          </div>

          {open && results.length > 0 && (
            <ul className="max-h-72 overflow-y-auto border-t border-line/60 py-1">
              {results.map((r, i) => (
                <li key={`${r.type}-${r.label}-${i}`}>
                  <button
                    type="button"
                    onClick={() => pick(r)}
                    className="flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-left hover:bg-raise"
                  >
                    <span className="truncate text-sm text-ink">
                      {r.label}
                    </span>
                    <span className="shrink-0 font-mono text-[0.65rem] uppercase tracking-wider text-ink-dim">
                      {r.sub}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {open && query.trim().length >= 2 && results.length === 0 && (
            <p className="border-t border-line/60 px-4 py-3 text-xs text-ink-dim">
              Nothing curated matches that yet. Know a spot? Submit it from
              your profile.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
