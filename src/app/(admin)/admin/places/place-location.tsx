"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
 * inputs so it submits with the surrounding native form. Falls back to plain
 * number inputs when no Mapbox token is configured.
 */
export function PlaceLocation({
  token,
  lat,
  lng,
}: {
  token: string | null;
  lat: number | null;
  lng: number | null;
}) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    lat !== null && lng !== null ? { lat, lng } : null,
  );

  if (!token) {
    return (
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Latitude" htmlFor="lat">
          <Input
            id="lat"
            name="lat"
            type="number"
            step="any"
            defaultValue={lat ?? ""}
          />
        </Field>
        <Field label="Longitude" htmlFor="lng">
          <Input
            id="lng"
            name="lng"
            type="number"
            step="any"
            defaultValue={lng ?? ""}
          />
        </Field>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink">Location</p>
      <LocationPicker
        token={token}
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
