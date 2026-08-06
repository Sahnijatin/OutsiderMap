"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MAX_ADMIN_MEDIA_BATCH,
  MAX_ADMIN_MEDIA_LABEL,
} from "@/lib/media/admin-media";
import {
  AdminUploadError,
  uploadAdminMedia,
  type UploadedMedia,
} from "@/lib/media/admin-upload-client";
import { attachCandidateMedia, removeCandidateMedia } from "./actions";

export type CandidateMediaItem =
  | { id: string; kind: "image" | "video"; url: string }
  | { id: string; kind: "embed"; sourceUrl: string; authorName: string | null };

type Staged = { key: string; file: File; previewUrl: string; isVideo: boolean };

/**
 * The media strip on a harvest candidate: what is already attached (each with
 * a remove control), a visible picker that takes several photos and clips at
 * once, and the button that actually sends them.
 *
 * Two buttons, because they do two different things and conflating them is
 * what made the old strip confusing: "Add photos / videos" opens the file
 * picker, "Upload data" commits the staged files. Nothing is uploaded until
 * the reviewer says so, so a mis-pick costs a click rather than a round trip.
 *
 * Files go straight from the browser to Storage through a signed URL. That is
 * the only reason video works here at all - the Server Action this used to
 * post through caps its request body at 4MB.
 */
export function CandidateMedia({
  candidateId,
  items,
}: {
  candidateId: string;
  items: CandidateMediaItem[];
}) {
  const [staged, setStaged] = useState<Staged[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const picker = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);

  function stage(list: FileList | null) {
    if (!list) return;
    setError(null);
    const room = MAX_ADMIN_MEDIA_BATCH - staged.length;
    const picked = Array.from(list).slice(0, Math.max(0, room));
    if (picked.length < list.length) {
      setError(`Up to ${MAX_ADMIN_MEDIA_BATCH} files at a time.`);
    }
    setStaged((cur) => [
      ...cur,
      ...picked.map((file) => ({
        key: `s${nextKey.current++}`,
        file,
        previewUrl: URL.createObjectURL(file),
        isVideo: file.type.startsWith("video/"),
      })),
    ]);
    // Reset so re-picking the same file still fires a change event.
    if (picker.current) picker.current.value = "";
  }

  function unstage(key: string) {
    setStaged((cur) => {
      const target = cur.find((s) => s.key === key);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return cur.filter((s) => s.key !== key);
    });
  }

  async function upload() {
    if (staged.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    const uploaded: UploadedMedia[] = [];
    const failures: string[] = [];

    for (const [i, item] of staged.entries()) {
      setProgress(`Uploading ${i + 1} of ${staged.length}…`);
      try {
        uploaded.push(await uploadAdminMedia(item.file, {
          target: "harvest",
          candidateId,
        }));
      } catch (err) {
        failures.push(
          err instanceof AdminUploadError
            ? err.message
            : `${item.file.name}: upload failed.`,
        );
      }
    }

    try {
      if (uploaded.length > 0) {
        setProgress("Saving…");
        await attachCandidateMedia({ candidateId, items: uploaded });
        staged.forEach((s) => URL.revokeObjectURL(s.previewUrl));
        setStaged([]);
      }
      if (failures.length > 0) setError(failures.join(" "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the upload.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function remove(id: string) {
    setRemoving(id);
    startTransition(async () => {
      try {
        await removeCandidateMedia(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't remove that.");
      } finally {
        setRemoving(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {/* pt-1 leaves room for the remove badges, which sit above each tile. */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        {items.map((item) =>
          item.kind === "embed" ? (
            <span
              key={item.id}
              className="group relative inline-flex items-center gap-2 rounded-full border border-line py-1 pl-3 pr-1 text-xs text-ink-dim"
            >
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                embed · {item.authorName ?? "creator"}
              </a>
              <RemoveButton
                label="Remove embed"
                busy={removing === item.id}
                onClick={() => remove(item.id)}
                inline
              />
            </span>
          ) : (
            <figure key={item.id} className="relative">
              {item.kind === "video" ? (
                <video
                  src={item.url}
                  className="size-16 rounded-xl object-cover"
                  muted
                  playsInline
                  preload="metadata"
                  controls={false}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="size-16 rounded-xl object-cover"
                />
              )}
              {item.kind === "video" && (
                <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-night/80 px-1 text-[0.6rem] uppercase tracking-wide text-ink">
                  clip
                </span>
              )}
              <RemoveButton
                label="Remove media"
                busy={removing === item.id}
                onClick={() => remove(item.id)}
              />
            </figure>
          ),
        )}

        {staged.map((item) => (
          <figure
            key={item.key}
            className="relative rounded-xl ring-2 ring-accent/60"
          >
            {item.isVideo ? (
              <video
                src={item.previewUrl}
                className="size-16 rounded-xl object-cover"
                muted
                playsInline
                preload="metadata"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.previewUrl}
                alt=""
                className="size-16 rounded-xl object-cover"
              />
            )}
            <RemoveButton
              label={`Remove ${item.file.name} from this upload`}
              busy={false}
              onClick={() => unstage(item.key)}
            />
          </figure>
        ))}

        <input
          ref={picker}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => stage(e.target.files)}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => picker.current?.click()}
        >
          Add photos / videos
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || staged.length === 0}
          onClick={upload}
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          {staged.length > 0 ? `Upload data (${staged.length})` : "Upload data"}
        </Button>
      </div>

      <p className="text-xs text-ink-dim">
        {progress ??
          `Photos and clips, up to ${MAX_ADMIN_MEDIA_BATCH} at a time, ${MAX_ADMIN_MEDIA_LABEL} each.`}
      </p>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

/**
 * The x on a thumbnail. `inline` drops the absolute positioning for the embed
 * chips, which sit in the flow rather than over a picture.
 */
function RemoveButton({
  label,
  busy,
  onClick,
  inline = false,
}: {
  label: string;
  busy: boolean;
  onClick: () => void;
  inline?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={busy}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center rounded-full text-ink-dim transition-colors hover:text-danger disabled:opacity-50",
        inline
          ? "size-5"
          : "absolute -right-1.5 -top-1.5 size-6 border border-line bg-night/90 hover:border-danger/60",
      )}
    >
      {busy ? (
        <Loader2 className="size-3 animate-spin" />
      ) : inline ? (
        <X className="size-3" />
      ) : (
        <Trash2 className="size-3" />
      )}
    </button>
  );
}
