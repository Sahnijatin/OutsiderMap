"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, MapPin, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { captureNativePhoto } from "@/lib/media/camera";
import { useIsNativeApp } from "@/lib/capacitor/platform";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import {
  LOCATION_PRECISIONS,
  POST_TYPES,
  POST_VISIBILITIES,
  type PostType,
} from "@/lib/feed/model";
import {
  allowedPostMediaExt,
  CreatePostSchema,
  MAX_POST_MEDIA,
  type PostMediaKind,
} from "@/lib/feed/compose";

type PlaceHit = {
  id: string;
  slug: string;
  name: string;
  area: string | null;
  category: string | null;
};

type LocalMedia = { file: File; url: string; kind: PostMediaKind; ext: string };

const TYPE_LABELS: Record<PostType, string> = {
  status: "Status",
  photo: "Photo",
  video: "Video",
  review: "Review",
  list: "List",
};

const VISIBILITY_LABELS: Record<(typeof POST_VISIBILITIES)[number], string> = {
  public: "Public — any member",
  followers: "Followers only",
  friends: "Friends only",
  private: "Only me",
};

const PRECISION_LABELS: Record<(typeof LOCATION_PRECISIONS)[number], string> = {
  exact: "Exact spot",
  area: "Just the area",
  hidden: "Hidden",
};

/** Best-effort {kind, ext} for a picked file; null if unsupported. */
function fileKindExt(file: File): { kind: PostMediaKind; ext: string } | null {
  const kind: PostMediaKind | null = file.type.startsWith("image/")
    ? "image"
    : file.type.startsWith("video/")
      ? "video"
      : null;
  if (!kind) return null;
  const norm = (raw: string | undefined) =>
    (raw ?? "")
      .toLowerCase()
      .replace("jpeg", "jpg")
      .replace("quicktime", "mov");
  const mimeExt = norm(file.type.split("/")[1]);
  const nameExt = norm(file.name.split(".").pop());
  const ext = allowedPostMediaExt(kind, mimeExt) ? mimeExt : nameExt;
  return allowedPostMediaExt(kind, ext) ? { kind, ext } : null;
}

export function Composer({ homeCity }: { homeCity: string }) {
  const [type, setType] = useState<PostType>("status");
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [placeLabel, setPlaceLabel] = useState<string | null>(null);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeHits, setPlaceHits] = useState<PlaceHit[]>([]);
  const [action, setAction] = useState("");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] =
    useState<(typeof POST_VISIBILITIES)[number]>("public");
  const [precision, setPrecision] =
    useState<(typeof LOCATION_PRECISIONS)[number]>("exact");
  const [media, setMedia] = useState<LocalMedia[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const isNative = useIsNativeApp();

  // Debounced catalog place search. A picked place suppresses searching. All
  // state updates happen inside the timer callback (never synchronously in the
  // effect body), and pickPlace clears the list immediately on selection.
  useEffect(() => {
    const q = placeQuery.trim();
    const timer = setTimeout(async () => {
      if (placeId || q.length < 2) {
        setPlaceHits([]);
        return;
      }
      try {
        const res = await fetch(
          `/api/places/search?q=${encodeURIComponent(q)}&city=${encodeURIComponent(homeCity)}`,
        );
        if (!res.ok) return;
        const json = (await res.json()) as { places?: PlaceHit[] };
        setPlaceHits(json.places ?? []);
      } catch {
        // Typeahead is best-effort; a failed lookup just shows nothing.
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [placeQuery, placeId, homeCity]);

  // Revoke object URLs on unmount so previews don't leak.
  useEffect(() => {
    return () => media.forEach((m) => URL.revokeObjectURL(m.url));
  }, [media]);

  function pickPlace(hit: PlaceHit) {
    setPlaceId(hit.id);
    setPlaceLabel([hit.name, hit.area].filter(Boolean).join(" · "));
    setPlaceQuery("");
    setPlaceHits([]);
  }

  function clearPlace() {
    setPlaceId(null);
    setPlaceLabel(null);
  }

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    setError(null);
    const next: LocalMedia[] = [];
    for (const file of Array.from(list)) {
      if (media.length + next.length >= MAX_POST_MEDIA) break;
      const ke = fileKindExt(file);
      if (!ke) {
        setError("Unsupported file — images (JPG/PNG/WebP) or video (MP4/WebM/MOV).");
        continue;
      }
      next.push({ file, url: URL.createObjectURL(file), ...ke });
    }
    if (next.length) setMedia((cur) => [...cur, ...next]);
    if (fileInput.current) fileInput.current.value = "";
  }

  // Native camera capture (no-op on web, where the tile isn't rendered).
  async function shoot() {
    try {
      const file = await captureNativePhoto("camera");
      if (file) addFiles([file]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the camera.");
    }
  }

  function removeMedia(idx: number) {
    setMedia((cur) => {
      const target = cur[idx];
      if (target) URL.revokeObjectURL(target.url);
      return cur.filter((_, i) => i !== idx);
    });
  }

  async function uploadOne(postId: string, item: LocalMedia) {
    const issue = await fetch(`/api/posts/${postId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: item.kind, ext: item.ext, size: item.file.size }),
    });
    const issued = (await issue.json()) as {
      path?: string;
      token?: string;
      message?: string;
    };
    if (!issue.ok || !issued.path || !issued.token) {
      throw new Error(issued.message ?? "Couldn't start the upload.");
    }
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from("post-media")
      .uploadToSignedUrl(issued.path, issued.token, item.file);
    if (uploadError) throw new Error("Upload failed — try again.");

    const confirm = await fetch(`/api/posts/${postId}/media/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: issued.path, kind: item.kind }),
    });
    if (!confirm.ok) {
      const b = (await confirm.json()) as { message?: string };
      throw new Error(b.message ?? "Couldn't save the upload.");
    }
  }

  async function submit() {
    setError(null);
    const payload = {
      type,
      place_id: placeId,
      action: action.trim() || null,
      body: body.trim() || null,
      visibility,
      location_precision: precision,
    };
    const parsed = CreatePostSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Add a place, a note, or an action.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const json = (await res.json()) as {
        post?: { id: string };
        message?: string;
      };
      if (!res.ok || !json.post) {
        throw new Error(json.message ?? "Couldn't create the post.");
      }
      for (const item of media) {
        await uploadOne(json.post.id, item);
      }
      media.forEach((m) => URL.revokeObjectURL(m.url));
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setType("status");
    clearPlace();
    setPlaceQuery("");
    setAction("");
    setBody("");
    setVisibility("public");
    setPrecision("exact");
    setMedia([]);
    setDone(false);
    setError(null);
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 px-5 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-accent/15 text-accent">
          <MapPin className="size-7" />
        </div>
        <h1 className="font-display text-2xl text-ink">Posted</h1>
        <p className="max-w-sm text-sm text-ink-dim">
          It&apos;s in the review queue. Once it clears moderation it shows up
          for the audience you chose.
        </p>
        <Button variant="secondary" onClick={reset}>
          Share another
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-5 pb-28 pt-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl text-ink">Share a place</h1>
        <p className="text-sm text-ink-dim">
          Anchor it to a real spot on the map. You choose who sees it.
        </p>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Post type">
        {POST_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={type === t}
            onClick={() => setType(t)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition-colors",
              type === t
                ? "border-accent bg-accent/10 text-ink"
                : "border-line text-ink-dim hover:text-ink",
            )}
          >
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <Field label="Place" hint="Search the catalog — posts are place-first.">
        {placeId ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
            <span className="flex min-w-0 items-center gap-2 text-ink">
              <MapPin className="size-4 shrink-0 text-accent" />
              <span className="truncate">{placeLabel}</span>
            </span>
            <button
              type="button"
              aria-label="Clear place"
              onClick={clearPlace}
              className="text-ink-dim hover:text-ink"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <Input
              value={placeQuery}
              onChange={(e) => setPlaceQuery(e.target.value)}
              placeholder="Search places…"
              aria-label="Search places"
            />
            {placeHits.length > 0 && (
              <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-lg">
                {placeHits.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      onClick={() => pickPlace(hit)}
                      className="flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-left hover:bg-raise"
                    >
                      <span className="truncate text-sm text-ink">{hit.name}</span>
                      <span className="shrink-0 font-mono text-[0.65rem] uppercase tracking-wider text-ink-dim">
                        {[hit.area, hit.category].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Field>

      <Field label="What's happening" hint="Optional — e.g. eating, exploring, chilling.">
        <Input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="eating…"
          maxLength={60}
        />
      </Field>

      <Field label="Say more" htmlFor="post-body">
        <Textarea
          id="post-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What made it worth a post?"
          maxLength={4000}
        />
      </Field>

      <Field label="Media" hint={`Up to ${MAX_POST_MEDIA} photos or clips.`}>
        <div className="flex flex-wrap gap-3">
          {media.map((m, i) => (
            <div
              key={m.url}
              className="relative size-20 overflow-hidden rounded-xl border border-line bg-raise"
            >
              {m.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt="" className="size-full object-cover" />
              ) : (
                <video src={m.url} className="size-full object-cover" muted />
              )}
              <button
                type="button"
                aria-label="Remove media"
                onClick={() => removeMedia(i)}
                className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-night/70 text-ink"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
          {media.length < MAX_POST_MEDIA && (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex size-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-ink-dim hover:border-ink-dim hover:text-ink"
            >
              <ImagePlus className="size-5" />
              <span className="text-[0.65rem]">Add</span>
            </button>
          )}
          {/* Native app: a real camera tile next to the picker (#143). Additive —
              "Add" still opens the OS picker for existing photos and video. */}
          {isNative && media.length < MAX_POST_MEDIA && (
            <button
              type="button"
              onClick={shoot}
              className="flex size-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-ink-dim hover:border-ink-dim hover:text-ink"
            >
              <Camera className="size-5" />
              <span className="text-[0.65rem]">Camera</span>
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(e) => addFiles(e.target.files)}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Who can see this" htmlFor="post-visibility">
          <Select
            id="post-visibility"
            value={visibility}
            onChange={(e) =>
              setVisibility(e.target.value as (typeof POST_VISIBILITIES)[number])
            }
          >
            {POST_VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {VISIBILITY_LABELS[v]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Location precision" htmlFor="post-precision">
          <Select
            id="post-precision"
            value={precision}
            onChange={(e) =>
              setPrecision(e.target.value as (typeof LOCATION_PRECISIONS)[number])
            }
          >
            {LOCATION_PRECISIONS.map((p) => (
              <option key={p} value={p}>
                {PRECISION_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={submitting}>
          {submitting && <Spinner />}
          {submitting ? "Posting…" : "Post"}
        </Button>
        <span className="text-xs text-ink-dim">Goes through review first.</span>
      </div>
    </main>
  );
}
