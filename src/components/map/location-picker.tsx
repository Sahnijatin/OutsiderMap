"use client";

import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, Marker } from "leaflet";
import { useEffect, useRef, useState } from "react";
import { MAP_ACCENT, MAP_NIGHT, baseTileLayer } from "@/lib/map/style";

export type LocationValue = {
  lat: number;
  lng: number;
  label?: string;
  area?: string;
};

/** Connaught Place, central Delhi. */
const DELHI = { lat: 28.6315, lng: 77.2167 };

type Suggestion = {
  id: string;
  text: string;
  lat: number;
  lng: number;
  area?: string;
};

/** Fields we read off a Nominatim search hit. */
type NominatimResult = {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address?: Record<string, string>;
};

function areaFromAddress(address?: Record<string, string>): string | undefined {
  return (
    address?.suburb ??
    address?.neighbourhood ??
    address?.city_district ??
    address?.city ??
    address?.town ??
    address?.village
  );
}

/** The draggable amber pin - same dot language as the public map's markers. */
function pinIcon(L: typeof import("leaflet")) {
  const size = 20;
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html:
      `<span style="display:block;width:${size}px;height:${size}px;` +
      "border-radius:9999px;" +
      `background:${MAP_ACCENT};border:2px solid ${MAP_NIGHT};` +
      'box-shadow:0 0 0 2px rgba(240,164,49,0.35);"></span>',
  });
}

/**
 * Dark, brand-styled Leaflet map (the same CARTO raster basemap as the public
 * map - no API key) with a draggable pin, tap-to-place, and a debounced
 * OpenStreetMap (Nominatim) place/address search. Reports the chosen point up
 * via onChange. Load this via next/dynamic ssr:false - Leaflet needs window.
 */
export function LocationPicker({
  value,
  onChange,
}: {
  value: LocationValue | null;
  onChange: (next: LocationValue) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const [query, setQuery] = useState(value?.label ?? "");

  const selectedTextRef = useRef<string | null>(null);
  const [results, setResults] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);

  // Drop (or move) the pin. Created lazily on the first placement.
  function placeMarker(lat: number, lng: number) {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (!markerRef.current) {
      const marker = L.marker([lat, lng], {
        icon: pinIcon(L),
        draggable: true,
      }).addTo(map);
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        onChangeRef.current({ lat: pos.lat, lng: pos.lng });
      });
      markerRef.current = marker;
      return;
    }
    markerRef.current.setLatLng([lat, lng]);
  }

  // Initialise the map once.
  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;

    void (async () => {
      if (!containerRef.current || mapRef.current) return;
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      LRef.current = L;

      const start = value ? { lat: value.lat, lng: value.lng } : DELHI;
      map = L.map(containerRef.current, {
        center: [start.lat, start.lng],
        zoom: value ? 15 : 11,
        zoomControl: true,
        attributionControl: true,
      });
      mapRef.current = map;
      map.attributionControl.setPrefix(false);
      baseTileLayer(L).addTo(map);

      if (value) placeMarker(value.lat, value.lng);

      map.on("click", (e) => {
        placeMarker(e.latlng.lat, e.latlng.lng);
        onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
      });

      // The admin form can lay out late; re-measure so tiles fill the box.
      requestAnimationFrame(() => map?.invalidateSize());
    })();

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // value is only the initial position; we intentionally init once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced Nominatim search, biased to India like the catalog. State is
  // only set inside the async timeout. A programmatic setQuery from select()
  // must not re-run the search and pop the dropdown back open.
  useEffect(() => {
    if (query.trim().length < 3) return;
    if (query === selectedTextRef.current) return;
    const controller = new AbortController();
    const id = setTimeout(async () => {
      try {
        const url =
          "https://nominatim.openstreetmap.org/search?format=jsonv2" +
          "&addressdetails=1&limit=6&countrycodes=in&q=" +
          encodeURIComponent(query.trim());
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error();
        const hits = (await res.json()) as NominatimResult[];
        setResults(
          hits.map((h) => ({
            id: String(h.place_id),
            text: h.display_name,
            lat: Number(h.lat),
            lng: Number(h.lon),
            area: areaFromAddress(h.address),
          })),
        );
        setOpen(true);
      } catch {
        if (!controller.signal.aborted) setResults([]);
      }
    }, 350);
    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [query]);

  function select(s: Suggestion) {
    selectedTextRef.current = s.text;
    setQuery(s.text);
    setOpen(false);
    placeMarker(s.lat, s.lng);
    mapRef.current?.setView([s.lat, s.lng], 16);
    onChangeRef.current({ lat: s.lat, lng: s.lng, label: s.text, area: s.area });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search a place or address…"
          aria-label="Search for the spot's location"
          className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-ink placeholder:text-ink-dim/60 transition-colors focus:border-accent"
        />
        {open && query.trim().length >= 3 && results.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-line bg-raise shadow-lg">
            {results.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(s)}
                  className="block w-full px-4 py-2.5 text-left text-sm text-ink-dim transition-colors hover:bg-surface hover:text-ink"
                >
                  {s.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* `isolate` keeps Leaflet's panes from painting over the dropdown. */}
      <div
        ref={containerRef}
        className="isolate h-64 w-full overflow-hidden rounded-xl border border-line"
      />
      <p className="text-xs text-ink-dim">
        Can&rsquo;t find it? Tap the map or drag the pin as close as you can.
        Search by Nominatim &copy; OpenStreetMap contributors.
      </p>
    </div>
  );
}
