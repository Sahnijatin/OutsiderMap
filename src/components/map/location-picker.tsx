"use client";

import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { useEffect, useRef, useState } from "react";

// setOptions must run once before the first importLibrary; guard across mounts.
let configured = false;

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
  prediction: google.maps.places.PlacePrediction;
};

/** Dark, low-chrome map style (no Map ID / Cloud styling required). */
const DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#16120e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9b9183" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0c0a08" }] },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#2b241c" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9b9183" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0c0a08" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9b9183" }],
  },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1e1914" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  {
    featureType: "administrative",
    elementType: "geometry",
    stylers: [{ color: "#2b241c" }],
  },
];

function areaFromComponents(
  components?: google.maps.places.AddressComponent[],
): string | undefined {
  const find = (t: string) =>
    components?.find((c) => c.types.includes(t))?.longText ?? undefined;
  return (
    find("sublocality_level_1") ?? find("neighborhood") ?? find("locality")
  );
}

function areaFromGeocode(
  components: google.maps.GeocoderAddressComponent[],
): string | undefined {
  const find = (t: string) =>
    components.find((c) => c.types.includes(t))?.long_name;
  return (
    find("sublocality_level_1") ??
    find("neighborhood") ??
    find("locality") ??
    find("administrative_area_level_2")
  );
}

/**
 * Dark, brand-styled Google map with Places search and a draggable pin. Search
 * is a convenience (best venue/address coverage for India); the draggable pin
 * (drag or tap the map) is the fallback for unlisted spots. Reports the chosen
 * point up via onChange. Load this via next/dynamic ssr:false - it needs
 * window. `token` is the Google Maps API key.
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
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const placesRef = useRef<google.maps.PlacesLibrary | null>(null);
  const sessionRef = useRef<google.maps.places.AutocompleteSessionToken | null>(
    null,
  );
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const [query, setQuery] = useState(value?.label ?? "");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);

  function placeMarker(lat: number, lng: number) {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    marker.setPosition({ lat, lng });
    marker.setMap(map);
  }

  async function reverseGeocode(lat: number, lng: number) {
    onChangeRef.current({ lat, lng });
    try {
      const geocoder = geocoderRef.current;
      if (!geocoder) return;
      const { results: r } = await geocoder.geocode({ location: { lat, lng } });
      const first = r[0];
      if (first) {
        onChangeRef.current({
          lat,
          lng,
          label: first.formatted_address,
          area: areaFromGeocode(first.address_components),
        });
      }
    } catch {
      // Keep the coordinates-only update.
    }
  }

  // Initialise the map + libraries once.
  useEffect(() => {
    let cancelled = false;
    if (!configured) {
      setOptions({ key: token, v: "weekly" });
      configured = true;
    }

    void (async () => {
      const [maps, markerLib, geocoding, places] = await Promise.all([
        importLibrary("maps"),
        importLibrary("marker"),
        importLibrary("geocoding"),
        importLibrary("places"),
      ]);
      if (cancelled || !containerRef.current || mapRef.current) return;
      const { Map } = maps;
      const { Marker } = markerLib;

      placesRef.current = places;
      geocoderRef.current = new geocoding.Geocoder();
      const start = value ? { lat: value.lat, lng: value.lng } : DELHI;

      const map = new Map(containerRef.current, {
        center: start,
        zoom: value ? 15 : 11,
        styles: DARK_STYLE,
        clickableIcons: false,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
      });
      mapRef.current = map;

      const accent =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--color-accent")
          .trim() || "#f0a431";
      const marker = new Marker({
        draggable: true,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: accent,
          fillOpacity: 1,
          strokeColor: "#0c0a08",
          strokeWeight: 2,
        },
      });
      if (value) {
        marker.setPosition(start);
        marker.setMap(map);
      }
      markerRef.current = marker;

      marker.addListener("dragend", () => {
        const pos = marker.getPosition();
        if (pos) void reverseGeocode(pos.lat(), pos.lng());
      });
      map.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        placeMarker(e.latLng.lat(), e.latLng.lng());
        void reverseGeocode(e.latLng.lat(), e.latLng.lng());
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current = null;
      markerRef.current = null;
    };
    // value is only the initial position; we intentionally init once per token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Debounced autocomplete. State is only set inside the async timeout.
  useEffect(() => {
    if (query.trim().length < 3) return;
    const id = setTimeout(async () => {
      const places = placesRef.current;
      if (!places) return;
      try {
        if (!sessionRef.current) {
          sessionRef.current = new places.AutocompleteSessionToken();
        }
        const { suggestions } =
          await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: query,
            sessionToken: sessionRef.current,
            includedRegionCodes: ["in"],
            locationBias: mapRef.current?.getBounds() ?? undefined,
          });
        const mapped: Suggestion[] = suggestions
          .map((s) => s.placePrediction)
          .filter((p): p is google.maps.places.PlacePrediction => p !== null)
          .map((p) => ({
            id: p.placeId,
            text: p.text.text,
            prediction: p,
          }));
        setResults(mapped);
        setOpen(true);
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [query]);

  async function select(s: Suggestion) {
    setQuery(s.text);
    setOpen(false);
    try {
      const place = s.prediction.toPlace();
      await place.fetchFields({
        fields: ["location", "displayName", "formattedAddress", "addressComponents"],
      });
      const loc = place.location;
      if (!loc) return;
      const lat = loc.lat();
      const lng = loc.lng();
      placeMarker(lat, lng);
      mapRef.current?.panTo({ lat, lng });
      mapRef.current?.setZoom(16);
      onChangeRef.current({
        lat,
        lng,
        label: place.displayName ?? place.formattedAddress ?? s.text,
        area: areaFromComponents(place.addressComponents ?? undefined),
      });
    } finally {
      // A session ends when a place is selected; start a fresh one next time.
      sessionRef.current = null;
    }
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
