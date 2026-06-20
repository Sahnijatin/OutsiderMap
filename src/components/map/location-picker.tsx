"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import mapboxgl from "mapbox-gl";
import { useEffect, useRef, useState } from "react";

export type LocationValue = {
  lat: number;
  lng: number;
  label?: string;
  area?: string;
};

/** [lng, lat] — Connaught Place, central Delhi. */
const DELHI: [number, number] = [77.2167, 28.6315];

type GeoFeature = {
  id: string;
  place_name: string;
  text: string;
  center: [number, number]; // [lng, lat]
  context?: { id: string; text: string }[];
};

/** Best neighbourhood/locality label from a geocoder feature's context. */
function neighbourhoodFrom(feature: GeoFeature): string | undefined {
  const ctx = feature.context ?? [];
  const hood = ctx.find(
    (c) => c.id.startsWith("neighborhood") || c.id.startsWith("locality"),
  );
  const place = ctx.find((c) => c.id.startsWith("place"));
  return hood?.text ?? place?.text ?? feature.text;
}

const GEOCODE = "https://api.mapbox.com/geocoding/v5/mapbox.places";

/**
 * Dark, brand-styled map with a place-search bar and a draggable pin. Search
 * is a convenience; the draggable pin (drag or tap the map) is the fallback for
 * unlisted spots. Reports the chosen point up via onChange. Uses mapbox-gl
 * imperatively (load this via next/dynamic ssr:false — it needs window).
 */
export function LocationPicker({
  token,
  value,
  onChange,
}: {
  token: string;
  value: LocationValue | null;
  onChange: (next: LocationValue) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  // Keep the latest onChange without re-running the map-init effect.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const [query, setQuery] = useState(value?.label ?? "");
  const [results, setResults] = useState<GeoFeature[]>([]);
  const [open, setOpen] = useState(false);

  async function reverseGeocode(lng: number, lat: number) {
    // Emit coordinates immediately; refine the label/area asynchronously.
    onChangeRef.current({ lat, lng });
    try {
      const res = await fetch(
        `${GEOCODE}/${lng},${lat}.json?access_token=${token}&types=poi,address,place&limit=1`,
      );
      const data = await res.json();
      const f: GeoFeature | undefined = data.features?.[0];
      if (f) {
        onChangeRef.current({
          lat,
          lng,
          label: f.place_name,
          area: neighbourhoodFrom(f),
        });
      }
    } catch {
      // Keep the coordinates-only update.
    }
  }

  // Initialise the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = token;
    const start: [number, number] = value ? [value.lng, value.lat] : DELHI;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: start,
      zoom: value ? 14 : 10,
    });
    mapRef.current = map;

    const accent =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--color-accent")
        .trim() || "#f0a431";
    const marker = new mapboxgl.Marker({ color: accent, draggable: true });
    if (value) marker.setLngLat([value.lng, value.lat]).addTo(map);
    markerRef.current = marker;

    marker.on("dragend", () => {
      const { lng, lat } = marker.getLngLat();
      void reverseGeocode(lng, lat);
    });
    map.on("click", (e) => {
      marker.setLngLat(e.lngLat).addTo(map);
      void reverseGeocode(e.lngLat.lng, e.lngLat.lat);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // value is only the initial position; we intentionally init once per token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Debounced forward search. State is only set inside the async timeout (never
  // synchronously in the effect body); the dropdown render is gated on query
  // length so stale results don't show for a short query.
  useEffect(() => {
    if (query.trim().length < 3) return;
    const id = setTimeout(async () => {
      try {
        const c = mapRef.current?.getCenter();
        const prox = c ? `&proximity=${c.lng},${c.lat}` : "";
        const res = await fetch(
          `${GEOCODE}/${encodeURIComponent(query)}.json?access_token=${token}&country=in&limit=5&types=poi,address,place,locality,neighborhood${prox}`,
        );
        const data = await res.json();
        setResults(data.features ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [query, token]);

  function select(f: GeoFeature) {
    const [lng, lat] = f.center;
    setQuery(f.place_name);
    setOpen(false);
    const map = mapRef.current;
    const marker = markerRef.current;
    if (map && marker) {
      marker.setLngLat([lng, lat]).addTo(map);
      map.flyTo({ center: [lng, lat], zoom: 15 });
    }
    onChangeRef.current({
      lat,
      lng,
      label: f.place_name,
      area: neighbourhoodFrom(f),
    });
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
          className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-ink placeholder:text-ink-dim/60 transition-colors focus:border-accent focus:outline-none"
        />
        {open && query.trim().length >= 3 && results.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-line bg-raise shadow-lg">
            {results.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(f)}
                  className="block w-full px-4 py-2.5 text-left text-sm text-ink-dim transition-colors hover:bg-surface hover:text-ink"
                >
                  {f.place_name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div
        ref={containerRef}
        className="h-64 w-full overflow-hidden rounded-xl border border-line"
      />
      <p className="text-xs text-ink-dim">
        Can&rsquo;t find it? Tap the map or drag the pin as close as you can.
      </p>
    </div>
  );
}
