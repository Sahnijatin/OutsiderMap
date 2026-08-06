"use client";

import { useMemo, useRef, useState } from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MAX_ADMIN_MEDIA_LABEL } from "@/lib/media/admin-media";
import {
  AdminUploadError,
  uploadAdminMedia,
} from "@/lib/media/admin-upload-client";
import type { Json } from "@/types/database";

type MediaType = "image" | "video";

type Card = {
  // Stable React key so file selections survive reordering.
  key: string;
  mediaPath: string | null;
  mediaType: MediaType;
  caption: string;
  file: File | null;
};

const PUBLIC_MEDIA_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/experience-media`
  : "";

/** Coerces the persisted `story` jsonb into editor cards, ignoring junk. */
function parseInitial(value: Json | undefined): Card[] {
  if (!Array.isArray(value)) return [];
  const cards: Card[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const obj = raw as Record<string, unknown>;
    const mediaPath = typeof obj.media_path === "string" ? obj.media_path : null;
    const caption = typeof obj.caption === "string" ? obj.caption : "";
    // Retain caption-only cards (they render over the hero image in the app);
    // drop only entirely-empty entries.
    if (!mediaPath && !caption) continue;
    cards.push({
      key: `existing-${cards.length}-${mediaPath ?? "caption"}`,
      mediaPath,
      mediaType: obj.media_type === "video" ? "video" : "image",
      caption,
      file: null,
    });
  }
  return cards;
}

export function StoryEditor({ initial }: { initial?: Json }) {
  const [cards, setCards] = useState<Card[]>(() => parseInitial(initial));
  const nextId = useRef(0);

  function update(i: number, patch: Partial<Card>) {
    setCards((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  function add() {
    setCards((cs) => [
      ...cs,
      {
        key: `new-${nextId.current++}`,
        mediaPath: null,
        mediaType: "image",
        caption: "",
        file: null,
      },
    ]);
  }

  function remove(i: number) {
    setCards((cs) => cs.filter((_, idx) => idx !== i));
  }

  function move(i: number, dir: -1 | 1) {
    setCards((cs) => {
      const j = i + dir;
      if (j < 0 || j >= cs.length) return cs;
      const next = cs.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Story</span>
        <span className="text-xs text-ink-dim">
          Ordered cards shown in the app
        </span>
      </div>

      {/* The server action reads cards by index, so order here == story order. */}
      <input type="hidden" name="story_count" value={cards.length} />

      {cards.length === 0 && (
        <p className="rounded-lg border border-dashed border-line bg-night/30 px-3 py-4 text-center text-sm text-ink-dim">
          No story yet. Add a card to start.
        </p>
      )}

      {cards.map((card, i) => (
        <StoryCardRow
          key={card.key}
          card={card}
          index={i}
          isFirst={i === 0}
          isLast={i === cards.length - 1}
          onChange={(patch) => update(i, patch)}
          onRemove={() => remove(i)}
          onMove={(dir) => move(i, dir)}
        />
      ))}

      <button
        type="button"
        onClick={add}
        className="self-start rounded-lg border border-line px-3 py-1.5 text-sm text-ink transition-colors hover:bg-night/40"
      >
        + Add card
      </button>
    </div>
  );
}

function StoryCardRow({
  card,
  index,
  isFirst,
  isLast,
  onChange,
  onRemove,
  onMove,
}: {
  card: Card;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<Card>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (card.file) return URL.createObjectURL(card.file);
    if (card.mediaPath) return `${PUBLIC_MEDIA_BASE}/${card.mediaPath}`;
    return null;
  }, [card.file, card.mediaPath]);

  /**
   * Send the file to Storage the moment it is picked, and submit only the
   * resulting path with the form.
   *
   * The form itself posts through a Server Action, whose request body caps at
   * 4MB - which is why a story clip never once uploaded successfully. If the
   * direct upload fails we keep the file on the input, so the old
   * through-the-action path still handles a small image rather than losing the
   * reviewer's pick.
   */
  async function pick(input: HTMLInputElement) {
    const file = input.files?.[0] ?? null;
    setUploadError(null);
    if (!file) {
      setStatus(null);
      onChange({ file: null });
      return;
    }

    onChange({
      file,
      mediaType: file.type.startsWith("video/") ? "video" : "image",
    });
    setStatus("Uploading…");
    try {
      const uploaded = await uploadAdminMedia(file, { target: "story" });
      input.value = "";
      onChange({ file: null, mediaPath: uploaded.path, mediaType: uploaded.kind });
      setStatus("Uploaded");
    } catch (err) {
      setStatus(null);
      setUploadError(
        err instanceof AdminUploadError
          ? err.message
          : "Direct upload failed - it will be sent with the form instead.",
      );
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-night/30 p-4 sm:flex-row">
      {/* Hidden fields carry existing media + resolved type for the action. */}
      <input
        type="hidden"
        name={`story_${index}_media_path`}
        value={card.mediaPath ?? ""}
      />
      <input
        type="hidden"
        name={`story_${index}_media_type`}
        value={card.mediaType}
      />

      <div className="flex w-full flex-col gap-2 sm:w-40 sm:shrink-0">
        <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg border border-line bg-surface">
          {preview ? (
            card.mediaType === "video" ? (
              <video
                src={preview}
                className="size-full object-cover"
                muted
                playsInline
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt={`Story card ${index + 1}`}
                className="size-full object-cover"
              />
            )
          ) : (
            <span className="px-2 text-center text-xs text-ink-dim">
              No media
            </span>
          )}
        </div>
        <input
          type="file"
          name={`story_${index}_file`}
          accept="image/*,video/*"
          className="block w-full text-xs text-ink-dim file:mr-2 file:rounded-md file:border file:border-line file:bg-surface file:px-2 file:py-1 file:text-xs file:text-ink hover:file:border-ink-dim"
          onChange={(e) => pick(e.currentTarget)}
        />
        <p className="text-[0.65rem] text-ink-dim">
          {status ?? `Photo or clip, ${MAX_ADMIN_MEDIA_LABEL} max.`}
        </p>
        {uploadError && (
          <p className="text-[0.65rem] text-danger">{uploadError}</p>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3">
        <Field label={`Caption · card ${index + 1}`} htmlFor={`cap-${index}`}>
          <Input
            id={`cap-${index}`}
            name={`story_${index}_caption`}
            value={card.caption}
            onChange={(e) => onChange({ caption: e.target.value })}
            placeholder="A line that sets the scene"
            maxLength={280}
          />
        </Field>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={isFirst}
            className="rounded-md border border-line px-2 py-1 text-xs text-ink-dim transition-colors hover:bg-night/40 disabled:opacity-40"
            aria-label="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={isLast}
            className="rounded-md border border-line px-2 py-1 text-xs text-ink-dim transition-colors hover:bg-night/40 disabled:opacity-40"
            aria-label="Move down"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto rounded-md border border-danger/40 bg-danger/10 px-2 py-1 text-xs text-danger transition-colors hover:bg-danger/20"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
