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
import { shareOrCopy } from "@/lib/native/share";
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

  // While the reel is rendering, poll until it lands.
  const rendering =
    quest.status === "completed" && quest.reel?.status === "rendering";
  useEffect(() => {
    if (!rendering) return;
    const t = setInterval(() => void refresh(), 20_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendering]);

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
        {quest.status === "completed" && <ReelPanel quest={quest} />}
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </div>

      <ol className="mt-6 flex flex-col gap-3 px-5">
        {stops.map((stop, i) => (
          <StopCard
            key={stop.id}
            questId={quest.id}
            stop={stop}
            index={i}
            questStatus={quest.status}
            busy={busy === stop.id}
            onComplete={() => complete(stop)}
            onMediaChange={() => void refresh()}
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
            got sharper, and your reel is being cut from what you shot.
          </p>
          <span className="relative text-xs text-ink-dim">tap to close</span>
        </button>
      )}
    </>
  );
}

function ReelPanel({ quest }: { quest: QuestDetail }) {
  const reel = quest.reel;
  const videoUrl = publicMediaUrl("reel-media", reel?.videoPath);
  const posterUrl = publicMediaUrl("reel-media", reel?.posterPath);
  const [exporting, setExporting] = useState<"share" | "download" | null>(null);

  function logShare() {
    void fetch("/api/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reel_share" }),
    }).catch(() => {});
  }

  async function fetchReelFile(): Promise<File> {
    const res = await fetch(videoUrl!);
    if (!res.ok) throw new Error("reel fetch failed");
    const blob = await res.blob();
    return new File([blob], "outsider-reel.mp4", { type: "video/mp4" });
  }

  // Share the actual FILE - a cross-origin URL neither downloads nor posts
  // to Instagram on iOS; the file opens the real share sheet.
  async function share() {
    if (!videoUrl || exporting) return;
    setExporting("share");
    try {
      const file = await fetchReelFile();
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: quest.title });
        logShare();
        return;
      }
      // Otherwise share the link: in the native app this opens the real OS
      // share sheet (the WebView has no navigator.share, so without this it
      // would silently degrade to the clipboard). Sharing the actual file on
      // native would need the reel written to disk first (@capacitor/filesystem)
      // - the link path is the honest fallback until then.
      const outcome = await shareOrCopy({ title: quest.title, url: videoUrl });
      if (outcome !== "dismissed" && outcome !== "failed") {
        logShare(); // the clipboard path counts as a share too
      }
    } catch {
      // Share sheet dismissed or unavailable - nothing to clean up.
    } finally {
      setExporting(null);
    }
  }

  async function download() {
    if (!videoUrl || exporting) return;
    setExporting("download");
    try {
      const file = await fetchReelFile();
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      window.open(videoUrl, "_blank", "noopener");
    } finally {
      setExporting(null);
    }
  }

  if (reel?.status === "ready" && videoUrl) {
    return (
      <div className="mt-4 overflow-hidden rounded-card border border-accent/40 bg-surface">
        <video
          src={videoUrl}
          poster={posterUrl ?? undefined}
          controls
          playsInline
          className="aspect-[9/16] max-h-96 w-full bg-night object-contain"
        />
        <div className="flex gap-2 p-3">
          <Button
            className="h-10 flex-1"
            disabled={exporting !== null}
            onClick={share}
          >
            {exporting === "share" ? (
              <Spinner className="border-night/30 border-t-night" />
            ) : null}
            Share reel
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-10"
            disabled={exporting !== null}
            onClick={download}
          >
            {exporting === "download" ? <Spinner className="size-4" /> : null}
            Save
          </Button>
        </div>
        <p className="px-3 pb-3 text-xs text-ink-dim">
          Your shots, your number, no branding. Post it anywhere.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-card border border-accent/40 bg-accent/10 p-4">
      <p className="font-display text-lg italic text-accent">
        Quest complete.
      </p>
      {reel?.status === "failed" ? (
        <p className="mt-1 text-sm text-ink-dim">
          The automatic edit hit a snag - the desk is crafting your reel by
          hand. It&rsquo;ll appear here.
        </p>
      ) : (
        <p className="mt-1 flex items-center gap-2 text-sm text-ink-dim">
          <Spinner className="size-3.5" />
          Cutting your reel from what you shot - a few minutes. It&rsquo;ll
          appear right here.
        </p>
      )}
    </div>
  );
}

function StopCard({
  questId,
  stop,
  index,
  questStatus,
  busy,
  onComplete,
  onMediaChange,
}: {
  questId: string;
  stop: QuestStopDetail;
  index: number;
  questStatus: string;
  busy: boolean;
  onComplete: () => void;
  onMediaChange: () => void;
}) {
  const guide = (stop.capture_guide ?? {}) as CaptureGuide;
  const locked = stop.status === "locked";
  const unlocked = stop.status === "unlocked" && questStatus === "active";
  const done = stop.status === "completed";
  const img = publicMediaUrl("place-images", stop.place?.image_path);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function uploadOne(rawFile: File) {
    let file = rawFile;
    const kind = file.type.startsWith("video/") ? "video" : "image";
    let extFromName = file.name.split(".").pop()?.toLowerCase() ?? "";

    // iPhones shoot HEIC/HEIF by default. Our renderer can't decode it, so
    // transcode to JPEG on-device - Safari (the platform that produces
    // HEIC) decodes it natively via createImageBitmap.
    const isHeic =
      kind === "image" &&
      (file.type === "image/heic" ||
        file.type === "image/heif" ||
        ["heic", "heif"].includes(extFromName));
    if (isHeic) {
      try {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
        bitmap.close();
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", 0.85),
        );
        if (!blob) throw new Error("transcode produced nothing");
        file = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
          type: "image/jpeg",
        });
        extFromName = "jpg";
      } catch {
        throw new Error(
          "That's an iPhone HEIC photo we can't read here. Switch Settings > Camera > Formats to Most Compatible, or screenshot the photo and upload that.",
        );
      }
    }

    // Resolve the real extension from MIME first (camera captures often
    // arrive with odd/absent names), then the filename. Anything we can't
    // identify is rejected with a clear message - never relabeled.
    const MIME_EXT: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "video/mp4": "mp4",
      "video/webm": "webm",
      "video/quicktime": "mov",
    };
    const VALID =
      kind === "image" ? ["jpg", "png", "webp"] : ["mp4", "webm", "mov"];
    const fromMime = MIME_EXT[file.type];
    const fromName = extFromName === "jpeg" ? "jpg" : extFromName;
    const ext = fromMime ?? (VALID.includes(fromName) ? fromName : null);
    if (!ext || !VALID.includes(ext)) {
      throw new Error(
        kind === "image"
          ? `That image format isn't supported - JPG, PNG or WebP.`
          : `That video format isn't supported - MP4, WebM or MOV.`,
      );
    }

    const issue = await fetch(
      `/api/quests/${questId}/stops/${stop.id}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ext, size: file.size }),
      },
    );
    const issued = (await issue.json()) as {
      path?: string;
      token?: string;
      message?: string;
    };
    if (!issue.ok || !issued.path || !issued.token) {
      throw new Error(issued.message ?? "Couldn't start the upload.");
    }

    // Straight to Storage - the app server never sees the bytes.
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from("quest-media")
      .uploadToSignedUrl(issued.path, issued.token, file);
    if (uploadError) throw new Error("Upload failed - try again.");

    const confirm = await fetch(
      `/api/quests/${questId}/stops/${stop.id}/media/confirm`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: issued.path, mediaType: kind }),
      },
    );
    if (!confirm.ok) {
      const body = (await confirm.json()) as { message?: string };
      throw new Error(body.message ?? "Couldn't save the upload.");
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setUploading(files.length);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 150 * 1024 * 1024) {
          throw new Error(`${file.name} is over 150MB.`);
        }
        await uploadOne(file);
        setUploading((n) => Math.max(0, n - 1));
      }
      onMediaChange();
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Upload failed - try again.",
      );
    } finally {
      setUploading(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

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
          {img && stop.media.length === 0 && (
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
            </div>
          )}

          {stop.media.length > 0 && (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {stop.media.map((m) =>
                m.url ? (
                  m.media_type === "video" ? (
                    <video
                      key={m.id}
                      src={m.url}
                      muted
                      playsInline
                      className="h-20 w-16 shrink-0 rounded-lg border border-line/60 object-cover"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={m.id}
                      src={m.url}
                      alt=""
                      className="h-20 w-16 shrink-0 rounded-lg border border-line/60 object-cover"
                    />
                  )
                ) : null,
              )}
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            onChange={(e) => void onFiles(e.target.files)}
          />
          {uploadError && (
            <p className="mb-2 text-xs text-danger">{uploadError}</p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={stop.media.length === 0 ? "primary" : "secondary"}
              className="flex-1"
              disabled={uploading > 0}
              onClick={() => fileRef.current?.click()}
            >
              {uploading > 0 ? (
                <Spinner />
              ) : (
                <Camera className="size-4" />
              )}
              {uploading > 0
                ? `Uploading ${uploading}…`
                : stop.media.length === 0
                  ? "Capture this stop"
                  : "Add more shots"}
            </Button>
            <Button
              size="sm"
              className="flex-1"
              disabled={busy || uploading > 0 || stop.media.length === 0}
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
