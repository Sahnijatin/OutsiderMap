"use client";

import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, CircleMarker, LayerGroup } from "leaflet";
import { LocateFixed } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MAP_ACCENT as ACCENT, baseTileLayer } from "@/lib/map/style";
import type { MapCategory } from "@/lib/map/categories";
import { readCachedLocation, writeCachedLocation } from "@/lib/map/location";
import {
  getDevicePosition,
  hasLocationPermission,
  isNativeApp,
} from "@/lib/map/geolocation";
import { tap } from "@/lib/native/haptics";
import { formatOutsiderNumber } from "@/lib/identity/username";
import { blockTour } from "@/lib/tour/store";
import { MapSearch } from "./map-search";
import { MapLegend } from "./map-legend";
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

// Colored category dots: a crisp fill on a dark night-outline, growing to an
// amber-ringed dot when selected. (Replaces the earlier 3D teardrop pins.)
const DOT_STROKE = "#0c0a08";
const DOT_RADIUS = 6;
const DOT_WEIGHT = 1.5;
const DOT_RADIUS_SELECTED = 9;

/**
 * Draw (or redraw) the "you are here" fix: an accuracy halo + a blue dot, and
 * cache the spot so the next open is instant. Shared by the web `locationfound`
 * event and the native Capacitor-GPS path so both render identically.
 */
function drawLocation(
  L: typeof import("leaflet"),
  map: LeafletMap,
  layerRef: { current: LayerGroup | null },
  lat: number,
  lng: number,
  accuracy: number | null,
) {
  writeCachedLocation(lat, lng, Date.now());
  if (!layerRef.current) {
    layerRef.current = L.layerGroup().addTo(map);
  }
  layerRef.current.clearLayers();
  const latlng: [number, number] = [lat, lng];
  if (accuracy != null) {
    L.circle(latlng, {
      radius: accuracy,
      color: ACCENT,
      weight: 1,
      opacity: 0.25,
      fillColor: ACCENT,
      fillOpacity: 0.06,
    }).addTo(layerRef.current);
  }
  L.circleMarker(latlng, {
    radius: 7,
    color: "#0c0a08",
    weight: 2,
    fillColor: "#4aa3ff",
    fillOpacity: 1,
  }).addTo(layerRef.current);
}

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
  /** Category color + label, resolved server-side (see /api/map/places). */
  categoryColor: string;
  categoryLabel: string;
  price_level: number | null;
  image_path: string | null;
  /** Exact Google navigation destination. Null until the pin is resolved. */
  googlePlaceId: string | null;
};

type PlaceCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  PlaceFeatureProps
>;

export function MapCanvas({
  city,
  cities,
  categories,
  initialPlaces,
  welcome,
  outsiderNumber,
  username,
  initialPlaceSlug,
}: {
  city: CityOption;
  cities: CityOption[];
  /** Active map categories, for the legend key. */
  categories: MapCategory[];
  /**
   * The starting city's pins, rendered server-side so the map draws them in the
   * first paint instead of waiting on a post-hydration fetch.
   */
  initialPlaces: PlaceCollection;
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
  // Markers by slug, so search / deep-links / selection can find a pin, and
  // the currently highlighted one to clear it.
  const markersRef = useRef<Map<string, CircleMarker>>(new Map());
  const selectedMarkerRef = useRef<CircleMarker | null>(null);
  const selectedSlugRef = useRef<string | null>(null);

  const [ready, setReady] = useState(false);
  const [activeCity, setActiveCity] = useState(city);
  const [places, setPlaces] = useState<PlaceCollection>(initialPlaces);
  const [selected, setSelected] = useState<SelectedPlace | null>(null);
  const [showWelcome, setShowWelcome] = useState(welcome);
  const [loadError, setLoadError] = useState(false);
  const [loadedEmpty, setLoadedEmpty] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [tileTrouble, setTileTrouble] = useState(false);
  const [locating, setLocating] = useState(false);
  const lastTileErrorAt = useRef(0);

  const highlightPin = useCallback((marker: CircleMarker | null) => {
    const prev = selectedMarkerRef.current;
    if (prev && prev !== marker) {
      prev.setStyle({ radius: DOT_RADIUS, weight: DOT_WEIGHT, color: DOT_STROKE });
    }
    if (marker) {
      marker.setStyle({ radius: DOT_RADIUS_SELECTED, weight: 2.5, color: ACCENT });
      marker.bringToFront();
    }
    selectedMarkerRef.current = marker;
  }, []);

  const selectPlace = useCallback(
    (props: PlaceFeatureProps, lng: number, lat: number) => {
      setSelected({ ...props, lng, lat });
      selectedSlugRef.current = props.slug;
      const map = mapRef.current;
      if (!map) return;
      highlightPin(markersRef.current.get(props.slug) ?? null);
      // Land the pin in the upper third; the sheet owns the bottom.
      map.setView([lat, lng], Math.max(map.getZoom(), 14), {
        animate: true,
      });
    },
    [highlightPin],
  );

  const closeSheet = useCallback(() => {
    setSelected(null);
    selectedSlugRef.current = null;
    highlightPin(null);
  }, [highlightPin]);

  const runLocate = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    tap(); // deliberate action - confirm it physically in the app
    setLocating(true);
    // Native app: Leaflet's locate() rides on the WebView's navigator.geolocation,
    // which is unreliable on iOS WKWebView - use the Capacitor GPS plugin and
    // draw the fix ourselves. Web keeps Leaflet's locate() unchanged.
    const L = LRef.current;
    if (L && (await isNativeApp())) {
      try {
        const pos = await getDevicePosition({ timeoutMs: 10_000 });
        drawLocation(L, map, locationLayerRef, pos.latitude, pos.longitude, pos.accuracy);
        map.setView([pos.latitude, pos.longitude], Math.max(map.getZoom(), 15));
      } catch {
        // Denied / unavailable - the button just stops spinning.
      } finally {
        setLocating(false);
      }
      return;
    }
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

      baseTileLayer(L)
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
        drawLocation(
          L,
          map!,
          locationLayerRef,
          e.latlng.lat,
          e.latlng.lng,
          e.accuracy,
        );
      });
      map.on("locationerror", () => setLocating(false));

      // TODO(#47): long-press (contextmenu / touch-hold) to submit a place -
      // the intended replacement for the retired /submit flow. Not built yet;
      // no contextmenu handler is wired here.

      // iOS Safari can size a fixed container late; recompute now and on the
      // next frame so the tiles fill the box instead of a 0-height canvas.
      map.invalidateSize();
      requestAnimationFrame(() => map?.invalidateSize());
      setTimeout(() => map?.invalidateSize(), 400);

      setReady(true);

      // Location, without nagging (#116): seed from the last known spot instantly
      // (no prompt), then auto-locate *only* if permission was already granted.
      // We never call locate() unprompted on load - the "Near me" button is the
      // explicit path that may raise the browser prompt.
      const cached = readCachedLocation(Date.now());
      if (cached) {
        map.setView([cached.lat, cached.lng], Math.max(map.getZoom(), 13));
      }
      if (await isNativeApp()) {
        // Native: only locate if permission is already granted (no prompt on
        // load), then read GPS via the plugin and draw the fix.
        if (!cancelled && (await hasLocationPermission())) {
          setLocating(true);
          try {
            const pos = await getDevicePosition({ timeoutMs: 10_000 });
            if (!cancelled) {
              drawLocation(L, map, locationLayerRef, pos.latitude, pos.longitude, pos.accuracy);
              map.setView(
                [pos.latitude, pos.longitude],
                Math.max(map.getZoom(), 15),
              );
            }
          } catch {
            /* denied / unavailable - cache + "Near me" remain */
          } finally {
            if (!cancelled) setLocating(false);
          }
        }
      } else {
        const perms = navigator.permissions;
        if (perms?.query) {
          perms
            .query({ name: "geolocation" as PermissionName })
            .then((status) => {
              if (status.state === "granted") {
                setLocating(true);
                map!.locate({
                  setView: true,
                  maxZoom: 15,
                  enableHighAccuracy: true,
                  timeout: 10_000,
                });
              }
            })
            .catch(() => {
              /* Permissions API unavailable - rely on the cache + "Near me". */
            });
        }
      }
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
    markersRef.current.clear();
    selectedMarkerRef.current = null;
    for (const f of places.features) {
      const [lng, lat] = f.geometry.coordinates;
      const props = f.properties;
      const marker = L.circleMarker([lat, lng], {
        radius: DOT_RADIUS,
        weight: DOT_WEIGHT,
        color: DOT_STROKE,
        fillColor: props.categoryColor,
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
      markersRef.current.set(props.slug, marker);
    }
    // Re-apply the highlight if the selected place survived the catalog change.
    const slug = selectedSlugRef.current;
    if (slug) highlightPin(markersRef.current.get(slug) ?? null);
  }, [places, ready, selectPlace, highlightPin]);

  // The server already rendered the starting city's pins, so skip the first
  // fetch for it - that round-trip is exactly what left the map empty on a cold
  // open. Switching city (or a retry) still fetches.
  const servedCity = useRef(
    initialPlaces.features.length > 0 ? city.slug : null,
  );

  // Load the city's catalog whenever the active city changes.
  useEffect(() => {
    if (servedCity.current === activeCity.slug && reloadKey === 0) {
      servedCity.current = null; // only skip the very first pass
      return;
    }
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
  // shares of the link don't re-trigger the toast. Only the welcome param
  // goes - rewriting the whole URL to "/map" also threw away ?place=, which
  // silently broke deep links that arrived alongside the flag.
  useEffect(() => {
    if (!welcome) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("welcome");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [welcome]);

  // The welcome card owns the screen while it is up; the guided tour waits its
  // turn rather than stacking a second overlay on top of it.
  useEffect(() => {
    if (!showWelcome) return;
    return blockTour("map-welcome");
  }, [showWelcome]);

  // Same for a deep-linked place sheet: an arriving ?place= link should get
  // read before the tour starts talking over it.
  useEffect(() => {
    if (!selected) return;
    return blockTour("place-sheet");
  }, [selected]);

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
    <div
      className="relative h-full w-full"
      style={
        {
          // One source of truth for the top overlay rows. Everything anchored to
          // the top of the map derives from --map-top, which clears the status
          // bar. Previously the search bar was safe-area aware but the controls
          // under it used hardcoded offsets (top-20 / top-32), so on a device
          // with a tall inset they slid under the search field - the "Near me"
          // button ended up half-hidden and untappable.
          "--map-top": "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
          "--map-row-2": "calc(var(--map-top) + 4.25rem)",
          "--map-row-3": "calc(var(--map-top) + 7.5rem)",
          "--map-row-4": "calc(var(--map-top) + 10.5rem)",
        } as React.CSSProperties
      }
    >
      {/*
       * `isolate` gives the Leaflet container its own stacking context, so its
       * internal panes (tiles z-200, markers z-600, tooltips z-650, controls
       * z-1000) stay contained instead of leaking into the parent context and
       * painting over our overlays. Without this the search bar and the place
       * sheet render *under* the map. Every overlay below sits above it.
       */}
      <div ref={containerRef} className="absolute inset-0 isolate" />

      <MapLegend categories={categories} />

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
        style={{ top: "var(--map-row-2)" }}
        className="absolute right-4 z-[500] flex items-center gap-1.5 rounded-full border border-accent/50 bg-surface/90 px-3.5 py-2 text-xs font-medium text-accent backdrop-blur transition-colors hover:bg-accent/10"
      >
        <LocateFixed
          className={locating ? "size-3.5 animate-spin" : "size-3.5"}
        />
        {locating ? "Finding you" : "Near me"}
      </button>

      {tileTrouble && (
        <p
          style={{ top: "var(--map-row-4)" }}
          className="absolute inset-x-0 z-[500] mx-auto w-fit rounded-full border border-line bg-surface/90 px-4 py-2 text-xs text-ink-dim backdrop-blur"
        >
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
          style={{ top: "var(--map-row-3)" }}
          className="absolute inset-x-0 z-[500] mx-auto w-fit rounded-full border border-line bg-surface/90 px-4 py-2 text-xs text-ink backdrop-blur"
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
