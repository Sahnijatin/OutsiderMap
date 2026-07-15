"use client";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Camera,
  Check,
  CircleCheck,
  Lock,
  MapPin,
  Navigation,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { baseMapStyle } from "@/lib/map/style";
import { publicMediaUrl } from "@/lib/media/url";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { QuestDetail, QuestStopDetail } from "@/lib/quests/machine";

const ACCENT = "#f0a431";
const NIGHT = "#0c0a08";
const INK = "#ede7db";

type CaptureGuide = {
  photos?: number;
  videos?: number;
  prompts?: string[];
};

export function QuestRun({ initial }: { initial: QuestDetail }) {
  const [quest, setQuest] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const stops = quest.stops;
  const withCoords = stops.filter(
    (s) => s.place?.lat != null && s.place?.lng != null,
  );

  async function refresh() {
    try {
      const res = await fetch(`/api/quests/${quest.id}`);
      if (res.ok) setQuest((await res.json()) as QuestDetail);
    } catch {
      // Keep current state; user can pull to refresh.
    }
  }

  // The route map: stops as numbered lights, connected by a dashed path.
  useEffect(() => {
    if (!mapContainer.current || mapRef.current || withCoords.length === 0) {
      return;
    }
    const lats = withCoords.map((s) => s.place!.lat!);
    const lngs = withCoords.map((s) => s.place!.lng!);
    const bounds = new maplibregl.LngLatBounds(
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    );

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: baseMapStyle(),
      bounds,
      fitBoundsOptions: { padding: 48, maxZoom: 14 },
      attributionControl: false,
      interactive: false,
    });
    mapRef.current = map;
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: "© OpenStreetMap",
      }),
      "bottom-left",
    );

    map.on("load", () => {
      map.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: withCoords.map((s) => [s.place!.lng!, s.place!.lat!]),
          },
          properties: {},
        },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        paint: {
          "line-color": ACCENT,
          "line-width": 2,
          "line-dasharray": [1.5, 2.5],
          "line-opacity": 0.7,
        },
      });
      map.addSource("stops", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: withCoords.map((s, i) => ({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [s.place!.lng!, s.place!.lat!],
            },
            properties: { n: String(i + 1), done: s.status === "completed" },
          })),
        },
      });
      map.addLayer({
        id: "stop-circles",
        type: "circle",
        source: "stops",
        paint: {
          "circle-color": [
            "case",
            ["get", "done"],
            ACCENT,
            NIGHT,
          ],
          "circle-stroke-color": ACCENT,
          "circle-stroke-width": 1.5,
          "circle-radius": 11,
        },
      });
      map.addLayer({
        id: "stop-numbers",
        type: "symbol",
        source: "stops",
        layout: {
          "text-field": ["get", "n"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 12,
        },
        paint: {
          "text-color": ["case", ["get", "done"], NIGHT, INK],
        },
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Repaint stop states after a completion.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource("stops") as maplibregl.GeoJSONSource | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: withCoords.map((s, i) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [s.place!.lng!, s.place!.lat!],
        },
        properties: { n: String(i + 1), done: s.status === "completed" },
      })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quest]);

  async function start() {
    setBusy("start");
    setError(null);
    try {
      const res = await fetch(`/api/quests/${quest.id}/start`, {
        method: "POST",
      });
      const body = (await res.json()) as { message?: string };
      if (!res.ok) throw new Error(body.message ?? "Couldn't start that.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start that.");
    } finally {
      setBusy(null);
    }
  }

  async function complete(stop: QuestStopDetail) {
    setBusy(stop.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/quests/${quest.id}/stops/${stop.id}/complete`,
        { method: "POST" },
      );
      const body = (await res.json()) as {
        questCompleted?: boolean;
        message?: string;
      };
      if (!res.ok) throw new Error(body.message ?? "Couldn't complete that.");
      if (body.questCompleted) setCelebrate(true);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't complete that.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {withCoords.length > 0 && (
        <div ref={mapContainer} className="h-56 w-full" />
      )}

      <div className="px-5 pt-4">
        <p className="voice capitalize">
          {quest.city} · {stops.length} stops
        </p>
        <h1 className="mt-1 font-display text-3xl italic">{quest.title}</h1>

        {quest.status === "draft" && (
          <Button className="mt-4 w-full" onClick={start} disabled={!!busy}>
            {busy === "start" ? (
              <Spinner className="border-night/30 border-t-night" />
            ) : null}
            Start the quest
          </Button>
        )}
        {quest.status === "completed" && (
          <div className="mt-4 rounded-card border border-accent/40 bg-accent/10 p-4">
            <p className="font-display text-lg italic text-accent">
              Quest complete.
            </p>
            <p className="mt-1 text-sm text-ink-dim">
              Your reel drops here in the next update - your shots, your
              number, no branding. For now: well walked, outsider.
            </p>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </div>

      <ol className="mt-6 flex flex-col gap-3 px-5">
        {stops.map((stop, i) => (
          <StopCard
            key={stop.id}
            stop={stop}
            index={i}
            questStatus={quest.status}
            busy={busy === stop.id}
            onComplete={() => complete(stop)}
          />
        ))}
      </ol>

      {celebrate && (
        <button
          type="button"
          onClick={() => setCelebrate(false)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-night/95 px-8 text-center backdrop-blur"
        >
          <div className="halo absolute inset-0" />
          <CircleCheck className="relative size-12 text-accent" />
          <p className="voice relative">quest complete</p>
          <h2 className="relative font-display text-3xl italic">
            You actually went.
          </h2>
          <p className="relative max-w-xs text-sm text-ink-dim">
            That&rsquo;s the whole point of this app. Your taste profile just
            got sharper, and reels land in the next update.
          </p>
          <span className="relative text-xs text-ink-dim">tap to close</span>
        </button>
      )}
    </>
  );
}

function StopCard({
  stop,
  index,
  questStatus,
  busy,
  onComplete,
}: {
  stop: QuestStopDetail;
  index: number;
  questStatus: string;
  busy: boolean;
  onComplete: () => void;
}) {
  const guide = (stop.capture_guide ?? {}) as CaptureGuide;
  const locked = stop.status === "locked";
  const unlocked = stop.status === "unlocked" && questStatus === "active";
  const done = stop.status === "completed";
  const img = publicMediaUrl("place-images", stop.place?.image_path);

  return (
    <li
      className={cn(
        "overflow-hidden rounded-card border transition-colors",
        done
          ? "border-accent/40 bg-surface"
          : unlocked
            ? "border-accent bg-surface"
            : "border-line/60 bg-surface/60",
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <span
          className={cn(
            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs",
            done
              ? "border-accent bg-accent text-night"
              : unlocked
                ? "border-accent text-accent"
                : "border-line text-ink-dim",
          )}
        >
          {done ? <Check className="size-4" /> : index + 1}
        </span>
        <div className={cn("min-w-0 flex-1", locked && "opacity-60")}>
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-medium text-ink">
              {stop.place?.name ?? "A place"}
            </p>
            {locked && <Lock className="size-4 shrink-0 text-ink-dim" />}
          </div>
          {stop.place?.area && (
            <p className="flex items-center gap-1 text-xs text-ink-dim">
              <MapPin className="size-3" /> {stop.place.area}
            </p>
          )}
          {!locked && stop.note && (
            <p className="mt-2 text-sm leading-relaxed text-ink-dim">
              {stop.note}
            </p>
          )}
        </div>
      </div>

      {unlocked && (
        <div className="border-t border-line/60 px-4 py-3">
          {img && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img}
              alt=""
              className="mb-3 aspect-[2/1] w-full rounded-xl object-cover"
            />
          )}
          {(guide.prompts?.length ?? 0) > 0 && (
            <div className="mb-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-accent">
                <Camera className="size-3.5" /> Shot list
                {guide.photos ? ` · ${guide.photos} photos` : ""}
                {guide.videos ? ` · ${guide.videos} clips` : ""}
              </p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {guide.prompts!.map((p) => (
                  <li key={p} className="text-xs leading-relaxed text-ink-dim">
                    · {p}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[0.65rem] uppercase tracking-wider text-ink-dim">
                capture upload lands next update - shoot them anyway
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              disabled={busy}
              onClick={onComplete}
            >
              {busy ? <Spinner className="border-night/30 border-t-night" /> : null}
              I did this
            </Button>
            {stop.place?.lat != null && stop.place?.lng != null && (
              <Button
                size="sm"
                variant="secondary"
                aria-label="Directions"
                className="w-9 px-0"
                onClick={() =>
                  window.open(
                    `https://www.google.com/maps/dir/?api=1&destination=${stop.place!.lat},${stop.place!.lng}`,
                    "_blank",
                    "noopener",
                  )
                }
              >
                <Navigation className="size-4" />
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
