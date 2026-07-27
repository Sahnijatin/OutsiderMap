"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { LocationValue } from "@/components/map/location-picker";

const LocationPicker = dynamic(
  () =>
    import("@/components/map/location-picker").then((m) => m.LocationPicker),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 w-full animate-pulse rounded-xl border border-line bg-surface" />
    ),
  },
);

/**
 * Map-backed lat/lng editor for the admin place form. Drives hidden `lat`/`lng`
 * inputs so it submits with the surrounding native form. The picker runs on
 * Leaflet + OpenStreetMap and needs no API key, so it always renders.
 */
export function PlaceLocation(props: {
  lat: number | null;
  lng: number | null;
}) {
  const { lat, lng } = props;
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    lat !== null && lng !== null ? { lat, lng } : null,
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink">Location</p>
      <LocationPicker
        value={coords}
        onChange={(loc: LocationValue) =>
          setCoords({ lat: loc.lat, lng: loc.lng })
        }
      />
      <input type="hidden" name="lat" value={coords?.lat ?? ""} />
      <input type="hidden" name="lng" value={coords?.lng ?? ""} />
      {coords && (
        <p className="font-mono text-xs text-ink-dim">
          {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
        </p>
      )}
    </div>
  );
}
