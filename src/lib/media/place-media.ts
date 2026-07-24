import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { publicMediaUrl } from "@/lib/media/url";

/**
 * Reading a place's photos and creator reels.
 *
 * Two shapes come out of here and they are not interchangeable:
 *
 *   hosted - a file in our bucket that we hold a licence to (a scout's photo,
 *            an owner's photo, our own shot). We render it directly.
 *   embed  - a reel or video the platform serves. We render the platform's
 *            embed, which carries the creator's handle and links back to them.
 *            We never hold a copy, so there is nothing for us to render if the
 *            creator deletes it - that is the trade for doing it lawfully.
 *
 * Attribution is required on embeds and enforced in the schema, so this
 * module can treat `author_name` and `source_url` as present on those rows.
 */

export type PlaceMediaItem =
  | {
      id: string;
      variant: "hosted";
      kind: "image" | "video";
      /** Public URL, ready to render. */
      src: string;
      caption: string | null;
      /** Present when a scout captured it on site. */
      capturedAt: string | null;
    }
  | {
      id: string;
      variant: "embed";
      kind: "embed";
      platform: "instagram" | "youtube" | "other";
      /** The creator's post. Always linked - this is the attribution. */
      sourceUrl: string;
      authorName: string;
      authorUrl: string | null;
      /** Platform-provided embed markup, when we have it. */
      embedHtml: string | null;
      thumbnailUrl: string | null;
      caption: string | null;
    };

const MEDIA_BUCKET = "place-images";

// One literal, not a concatenation - supabase-js infers the row type from the
// string, and joining it loses that.
const FIELDS =
  "id, kind, licence_basis, storage_path, source_url, source_platform, author_name, author_url, embed_html, thumbnail_url, caption, captured_at, sort_order";

/**
 * Published media for a place, in display order. Never throws: a place page
 * with no pictures is worse than one with no pictures *and* an error, so a
 * failed read degrades to an empty gallery.
 */
export async function listPlaceMedia(
  supabase: SupabaseClient<Database>,
  placeId: string,
): Promise<PlaceMediaItem[]> {
  const { data, error } = await supabase
    .from("place_media")
    .select(FIELDS)
    .eq("place_id", placeId)
    .eq("status", "published")
    .order("sort_order")
    .order("created_at");

  if (error || !data) return [];
  return data.flatMap((row) => toItem(row) ?? []);
}

type MediaRow = {
  id: string;
  kind: string;
  licence_basis: string;
  storage_path: string | null;
  source_url: string | null;
  source_platform: string | null;
  author_name: string | null;
  author_url: string | null;
  embed_html: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  captured_at: string | null;
};

/** Maps a row to a renderable item, or null when it is unusable. */
export function toItem(row: MediaRow): PlaceMediaItem | null {
  if (row.licence_basis === "embed") {
    // The schema guarantees these, but a null here would mean showing
    // someone's work with no credit, so it is worth the belt and braces.
    if (!row.source_url || !row.author_name) return null;
    return {
      id: row.id,
      variant: "embed",
      kind: "embed",
      platform: isPlatform(row.source_platform) ? row.source_platform : "other",
      sourceUrl: row.source_url,
      authorName: row.author_name,
      authorUrl: row.author_url,
      embedHtml: row.embed_html,
      thumbnailUrl: row.thumbnail_url,
      caption: row.caption,
    };
  }

  const src = publicMediaUrl(MEDIA_BUCKET, row.storage_path);
  if (!src) return null;
  return {
    id: row.id,
    variant: "hosted",
    kind: row.kind === "video" ? "video" : "image",
    src,
    caption: row.caption,
    capturedAt: row.captured_at,
  };
}

function isPlatform(v: string | null): v is "instagram" | "youtube" | "other" {
  return v === "instagram" || v === "youtube" || v === "other";
}

/** "@handle" for display, tolerating the shapes oEmbed hands back. */
export function displayHandle(authorName: string): string {
  const trimmed = authorName.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}
