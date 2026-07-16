"use client";

import "leaflet/dist/leaflet.css";
import type {
  Map as LeafletMap,
  CircleMarker,
  LayerGroup,
} from "leaflet";
import { LocateFixed } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MAP_ACCENT as ACCENT, MAP_NIGHT as NIGHT } from "@/lib/map/style";
import { formatOutsiderNumber } from "@/lib/identity/username";
import { MapSearch } from "./map-search";
import { PlaceSheet, type SelectedPlace } from "./place-sheet";

/**
 * The map, on Leaflet.
 *
 * We render with Leaflet (plain <img> raster tiles) rather than a WebGL
 * engine: on some phones the GL canvas never painted and left the map black
 * with no error to catch. Leaflet needs no WebGL and no background worker,
 * so it draws on effectively any device - the reliability the map has to
 * have as the home screen. Tiles are CARTO's dark, label-free basemap; the
 * only labels are our own amber place names.
 */

const CARTO_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png";
const MAP_ATTRIBUTION =
  '&copy; OpenStreetMap contributors &copy; CARTO';

export type CityOption = {
  slug: string;
  name: string;
  lat: number;
  lng: number;
  zoom: number;
};

export type PlaceFeatureProps = {
  id: string;
  slug: string;
  name: string;
  area: string | null;
  kind: string;
  category: string | null;
  price_level: number | null;
  image_path: string | null;
};

type PlaceCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  PlaceFeatureProps
>;

const EMPTY: PlaceCollection = { type: "FeatureCollection", features: [] };

export function MapCanvas({
  city,
  cities,
  welcome,
  outsiderNumber,
  username,
  initialPlaceSlug,
}: {
  city: CityOption;
  cities: CityOption[];
  welcome: boolean;
  outsiderNumber: number | null;
  username: string | null;
  /** Deep link (?place=slug): opens that place's sheet once data loads. */
  initialPlaceSlug: string | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  // The Leaflet module, loaded on the client only (it touches window/document
  // at import, which would break SSR).
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const placeLayerRef = useRef<LayerGroup | null>(null);
  const locationLayerRef = useRef<LayerGroup | null>(null);
  const selectedRingRef = useRef<CircleMarker | null>(null);

  const [ready, setReady] = useState(false);
  const [activeCity, setActiveCity] = useState(city);
  const [places, setPlaces] = useState<PlaceCollection>(EMPTY);
  const [selected, setSelected] = useState<SelectedPlace | null>(null);
  const [showWelcome, setShowWelcome] = useState(welcome);
  const [loadError, setLoadError] = useState(false);
  const [loadedEmpty, setLoadedEmpty] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [tileTrouble, setTileTrouble] = useState(false);
  const [locating, setLocating] = useState(false);
  const lastTileErrorAt = useRef(0);

  const selectPlace = useCallback(
    (props: PlaceFeatureProps, lng: number, lat: number) => {
      setSelected({ ...props, lng, lat });
      const map = mapRef.current;
      const L = LRef.current;
      if (!map || !L) return;
      selectedRingRef.current?.remove();
      selectedRingRef.current = L.circleMarker([lat, lng], {
        radius: 13,
        color: "#ede7db",
        weight: 2,
        fill: false,
      }).addTo(map);
      // Land the pin in the upper third; the sheet owns the bottom.
      map.setView([lat, lng], Math.max(map.getZoom(), 14), {
        animate: true,
      });
    },
    [],
  );

  const closeSheet = useCallback(() => {
    setSelected(null);
    selectedRingRef.current?.remove();
    selectedRingRef.current = null;
  }, []);

  const runLocate = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    setLocating(true);
    map.locate({
      setView: true,
      maxZoom: 15,
      enableHighAccuracy: true,
      timeout: 10_000,
    });
  }, []);

  // Build the map once, on the client.
  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;

    (async () => {
      if (!containerRef.current || mapRef.current) return;
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;
      LRef.current = L;

      map = L.map(containerRef.current, {
        center: [city.lat, city.lng],
        zoom: city.zoom,
        zoomControl: false,
        attributionControl: true,
        minZoom: 3,
        maxZoom: 20,
        worldCopyJump: true,
      });
      mapRef.current = map;
      map.attributionControl.setPrefix(false);

      L.tileLayer(CARTO_TILE_URL, {
        subdomains: "abcd",
        detectRetina: true,
        maxZoom: 20,
        attribution: MAP_ATTRIBUTION,
      })
        .on("tileerror", () => {
          const now = Date.now();
          if (now - lastTileErrorAt.current < 30_000) return;
          lastTileErrorAt.current = now;
          setTileTrouble(true);
          setTimeout(() => setTileTrouble(false), 6000);
        })
        .addTo(map);

      placeLayerRef.current = L.layerGroup().addTo(map);

      // Show our place labels only once the city is close enough to read.
      const applyLabelZoom = () => {
        containerRef.current?.classList.toggle(
          "labels-on",
          (map?.getZoom() ?? 0) >= 14,
        );
      };
      map.on("zoomend", applyLabelZoom);
      applyLabelZoom();

      map.on("locationfound", (e) => {
        setLocating(false);
        if (!locationLayerRef.current) {
          locationLayerRef.current = L.layerGroup().addTo(map!);
        }
        locationLayerRef.current.clearLayers();
        L.circle(e.latlng, {
          radius: e.accuracy,
          color: ACCENT,
          weight: 1,
          opacity: 0.25,
          fillColor: ACCENT,
          fillOpacity: 0.06,
        }).addTo(locationLayerRef.current);
        L.circleMarker(e.latlng, {
          radius: 7,
          color: "#0c0a08",
          weight: 2,
          fillColor: "#4aa3ff",
          fillOpacity: 1,
        }).addTo(locationLayerRef.current);
      });
      map.on("locationerror", () => setLocating(false));

      // iOS Safari can size a fixed container late; recompute now and on the
      // next frame so the tiles fill the box instead of a 0-height canvas.
      map.invalidateSize();
      requestAnimationFrame(() => map?.invalidateSize());
      setTimeout(() => map?.invalidateSize(), 400);

      setReady(true);

      // Drop the member onto their own location on first paint (best effort;
      // the "Near me" button is the reliable path if the prompt is held).
      setLocating(true);
      map.locate({
        setView: true,
        maxZoom: 15,
        enableHighAccuracy: true,
        timeout: 10_000,
      });
    })();

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the canvas sized to the container across rotation / toolbar changes.
  useEffect(() => {
    const onResize = () => mapRef.current?.invalidateSize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  // Render the place markers whenever the catalog (or map readiness) changes.
  useEffect(() => {
    const L = LRef.current;
    const layer = placeLayerRef.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();
    for (const f of places.features) {
      const [lng, lat] = f.geometry.coordinates;
      const props = f.properties;
      const marker = L.circleMarker([lat, lng], {
        radius: 6,
        color: NIGHT,
        weight: 2,
        fillColor: ACCENT,
        fillOpacity: 1,
      });
      marker.bindTooltip(props.name, {
        permanent: true,
        direction: "bottom",
        offset: [0, 6],
        className: "om-place-label",
      });
      marker.on("click", () => selectPlace(props, lng, lat));
      marker.addTo(layer);
    }
  }, [places, ready, selectPlace]);

  // Load the city's catalog whenever the active city changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = `/api/map/places?city=${encodeURIComponent(activeCity.slug)}`;
        let res = await fetch(url);
        if (res.status === 401) {
          // Safari can race a token expiry between SSR and this fetch:
          // refresh the session once, then retry before declaring failure.
          const { createClient } = await import("@/lib/supabase/client");
          await createClient().auth.refreshSession();
          res = await fetch(url);
        }
        if (!res.ok) throw new Error();
        const data = (await res.json()) as PlaceCollection;
        if (cancelled) return;
        setPlaces(data);
        setLoadError(false);
        setLoadedEmpty(data.features.length === 0);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCity.slug, reloadKey]);

  // The welcome flag is a one-shot: strip it from the URL so revisits and
  // shares of the link don't re-trigger the toast.
  useEffect(() => {
    if (!welcome) return;
    window.history.replaceState(null, "", "/map");
  }, [welcome]);

  // Deep link: open the requested place once the catalog is in.
  const deepLinked = useRef(false);
  useEffect(() => {
    if (!ready || !initialPlaceSlug || deepLinked.current) return;
    const feature = places.features.find(
      (f) => f.properties.slug === initialPlaceSlug,
    );
    if (!feature) return;
    deepLinked.current = true;
    const [lng, lat] = feature.geometry.coordinates;
    const props = feature.properties;
    const id = requestAnimationFrame(() => selectPlace(props, lng, lat));
    return () => cancelAnimationFrame(id);
  }, [ready, initialPlaceSlug, places, selectPlace]);

  const flyTo = useCallback((lng: number, lat: number, zoom: number) => {
    mapRef.current?.flyTo([lat, lng], zoom);
  }, []);

  const switchCity = useCallback(
    (next: CityOption) => {
      setActiveCity(next);
      closeSheet();
      flyTo(next.lng, next.lat, next.zoom);
    },
    [closeSheet, flyTo],
  );

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />

      <MapSearch
        cityName={activeCity.name}
        cities={cities}
        places={places}
        onCity={switchCity}
        onArea={(lng, lat) => {
          closeSheet();
          flyTo(lng, lat, 14);
        }}
        onPlace={(props, lng, lat) => {
          flyTo(lng, lat, 14.5);
          selectPlace(props, lng, lat);
        }}
      />

      {/* Reliable locate affordance: the auto-nudge on load may be held for a
          tap on iOS Safari, so this is always here. */}
      <button
        type="button"
        aria-label="Center on my location"
        onClick={runLocate}
        className="absolute right-4 top-20 z-[500] flex items-center gap-1.5 rounded-full border border-accent/50 bg-surface/90 px-3.5 py-2 text-xs font-medium text-accent backdrop-blur transition-colors hover:bg-accent/10"
      >
        <LocateFixed
          className={locating ? "size-3.5 animate-spin" : "size-3.5"}
        />
        {locating ? "Finding you" : "Near me"}
      </button>

      {tileTrouble && (
        <p className="absolute inset-x-0 top-32 z-[500] mx-auto w-fit rounded-full border border-line bg-surface/90 px-4 py-2 text-xs text-ink-dim backdrop-blur">
          Map tiles are struggling - check your connection.
        </p>
      )}

      {loadError && (
        <button
          type="button"
          onClick={() => {
            setLoadError(false);
            setReloadKey((k) => k + 1);
          }}
          className="absolute inset-x-0 top-20 z-[500] mx-auto w-fit rounded-full border border-line bg-surface/90 px-4 py-2 text-xs text-ink backdrop-blur"
        >
          Couldn&rsquo;t load places · tap to retry
        </button>
      )}

      {!loadError && loadedEmpty && (
        <div className="absolute inset-x-6 top-1/3 z-[500] mx-auto max-w-sm rounded-card border border-line bg-surface/95 p-5 text-center backdrop-blur-md">
          <p className="voice">quiet, for now</p>
          <p className="mt-2 font-display text-xl italic">
            Nothing lit up in {activeCity.name} yet.
          </p>
          <p className="mt-1 text-sm text-ink-dim">
            The catalog is being stocked - the lights come on soon. Check
            back, or ask the concierge meanwhile.
          </p>
        </div>
      )}

      {showWelcome && !loadedEmpty && (
        <button
          type="button"
          onClick={() => setShowWelcome(false)}
          className="absolute inset-x-4 bottom-6 z-[500] mx-auto max-w-sm rounded-card border border-accent/40 bg-surface/95 p-4 text-left backdrop-blur-md"
        >
          <p className="voice text-accent">
            outsider {formatOutsiderNumber(outsiderNumber)}
          </p>
          <p className="mt-1 font-display text-lg italic">
            Welcome{username ? `, @${username}` : ""}. This is your city now.
          </p>
          <p className="mt-1 text-xs text-ink-dim">
            Every light on this map is a place worth leaving the house for.
            Tap one.
          </p>
        </button>
      )}

      {selected && (
        <PlaceSheet key={selected.slug} place={selected} onClose={closeSheet} />
      )}
    </div>
  );
}
