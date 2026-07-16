"use client";

import maplibregl, {
  type GeoJSONSource,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { baseMapStyle } from "@/lib/map/style";
import { formatOutsiderNumber } from "@/lib/identity/username";
import { MapSearch } from "./map-search";
import { PlaceSheet, type SelectedPlace } from "./place-sheet";

const ACCENT = "#f0a431";
const NIGHT = "#0c0a08";
const INK = "#ede7db";

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
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [activeCity, setActiveCity] = useState(city);
  const [places, setPlaces] = useState<PlaceCollection>(EMPTY);
  const [selected, setSelected] = useState<SelectedPlace | null>(null);
  const [showWelcome, setShowWelcome] = useState(welcome);
  const [loadError, setLoadError] = useState(false);
  const [loadedEmpty, setLoadedEmpty] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const selectPlace = useCallback(
    (props: PlaceFeatureProps, lng: number, lat: number) => {
      setSelected({ ...props, lng, lat });
      const map = mapRef.current;
      if (!map) return;
      const ring: PlaceCollection = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [lng, lat] },
            properties: props,
          },
        ],
      };
      (map.getSource("selected-place") as GeoJSONSource | undefined)?.setData(
        ring,
      );
      // Land the pin in the top half; the sheet owns the bottom.
      map.easeTo({
        center: [lng, lat],
        zoom: Math.max(map.getZoom(), 13.5),
        padding: { top: 0, left: 0, right: 0, bottom: 320 },
        duration: 600,
      });
    },
    [],
  );

  const closeSheet = useCallback(() => {
    setSelected(null);
    const map = mapRef.current;
    (map?.getSource("selected-place") as GeoJSONSource | undefined)?.setData(
      EMPTY,
    );
    map?.easeTo({
      padding: { top: 0, left: 0, right: 0, bottom: 0 },
      duration: 300,
    });
  }, []);

  // One map for the component's lifetime; city changes fly, not remount.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: baseMapStyle(),
      center: [city.lng, city.lat],
      zoom: city.zoom,
      attributionControl: false,
      // The night style has no labels; keep rotation off so the city stays
      // oriented the way people hold their phones.
      dragRotate: false,
      pitchWithRotate: false,
    });
    mapRef.current = map;

    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: "© OpenStreetMap",
      }),
      "bottom-left",
    );
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserLocation: true,
      }),
      "bottom-right",
    );
    map.touchZoomRotate.disableRotation();

    map.on("load", () => {
      map.addSource("places", {
        type: "geojson",
        data: EMPTY,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 48,
        promoteId: "id",
      });
      map.addSource("selected-place", { type: "geojson", data: EMPTY });

      // Clusters: a sodium-lamp pool of light with a count.
      map.addLayer({
        id: "cluster-glow",
        type: "circle",
        source: "places",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": ACCENT,
          "circle-opacity": 0.16,
          "circle-radius": [
            "step",
            ["get", "point_count"],
            26,
            10,
            34,
            25,
            44,
          ],
        },
      });
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "places",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": NIGHT,
          "circle-stroke-color": ACCENT,
          "circle-stroke-width": 1.5,
          "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 25, 24],
        },
      });
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "places",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 12,
        },
        paint: { "text-color": INK },
      });

      // Single places: a warm dot with a faint halo.
      map.addLayer({
        id: "place-glow",
        type: "circle",
        source: "places",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ACCENT,
          "circle-opacity": 0.18,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            8,
            15,
            16,
          ],
        },
      });
      map.addLayer({
        id: "place-dot",
        type: "circle",
        source: "places",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ACCENT,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3.5, 15, 6],
          "circle-stroke-color": NIGHT,
          "circle-stroke-width": 1.5,
        },
      });
      // Selection ring, driven by its own single-feature source.
      map.addLayer({
        id: "selected-ring",
        type: "circle",
        source: "selected-place",
        paint: {
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-color": INK,
          "circle-stroke-width": 2,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 9, 15, 14],
        },
      });

      map.on("click", "clusters", async (e: MapMouseEvent) => {
        const feature = map.queryRenderedFeatures(e.point, {
          layers: ["clusters"],
        })[0];
        if (!feature) return;
        const clusterId = feature.properties?.cluster_id as number;
        const source = map.getSource("places") as GeoJSONSource;
        const zoom = await source.getClusterExpansionZoom(clusterId);
        map.easeTo({
          center: (feature.geometry as GeoJSON.Point).coordinates as [
            number,
            number,
          ],
          zoom: zoom + 0.3,
          duration: 500,
        });
      });

      map.on("click", "place-dot", (e: MapMouseEvent) => {
        const feature = map.queryRenderedFeatures(e.point, {
          layers: ["place-dot"],
        })[0];
        if (!feature) return;
        const props = feature.properties as PlaceFeatureProps;
        const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
        selectPlace(props, lng, lat);
      });

      for (const layer of ["clusters", "place-dot"]) {
        map.on("mouseenter", layer, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
        });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        const map = mapRef.current;
        const apply = () =>
          (map?.getSource("places") as GeoJSONSource | undefined)?.setData(
            data,
          );
        if (map?.isStyleLoaded()) apply();
        else map?.once("load", apply);
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
    if (!initialPlaceSlug || deepLinked.current) return;
    const feature = places.features.find(
      (f) => f.properties.slug === initialPlaceSlug,
    );
    if (!feature) return;
    deepLinked.current = true;
    const [lng, lat] = feature.geometry.coordinates;
    const open = () => selectPlace(feature.properties, lng, lat);
    const map = mapRef.current;
    if (map?.isStyleLoaded()) open();
    else map?.once("load", open);
  }, [initialPlaceSlug, places, selectPlace]);

  const flyTo = useCallback((lng: number, lat: number, zoom: number) => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 1200 });
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

      {loadError && (
        <button
          type="button"
          onClick={() => {
            setLoadError(false);
            setReloadKey((k) => k + 1);
          }}
          className="absolute inset-x-0 top-20 z-10 mx-auto w-fit rounded-full border border-line bg-surface/90 px-4 py-2 text-xs text-ink backdrop-blur"
        >
          Couldn&rsquo;t load places · tap to retry
        </button>
      )}

      {!loadError && loadedEmpty && (
        <div className="absolute inset-x-6 top-1/3 z-10 mx-auto max-w-sm rounded-card border border-line bg-surface/95 p-5 text-center backdrop-blur-md">
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
          className="absolute inset-x-4 bottom-6 z-10 mx-auto max-w-sm rounded-card border border-accent/40 bg-surface/95 p-4 text-left backdrop-blur-md"
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
