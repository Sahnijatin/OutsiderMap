/**
 * Deciding whether a picked file is a photo or a clip, and what to call its
 * extension.
 *
 * This looks like a one-liner (`file.type.startsWith("video/")`) and that
 * one-liner is why video "didn't work" for a lot of people: Android's picker
 * hands back `application/octet-stream` for plenty of real MP4s, and some
 * camera captures arrive with an empty type. Trusting the MIME type alone
 * classified those as images, and the upload was then rejected for not being a
 * supported *image* format - an error message pointing at the wrong thing.
 *
 * So: MIME type first (it is right when it is present), filename second, and
 * only give up when neither says anything we accept. Pure, so the browser and
 * the route handler can agree.
 */

export type MediaKind = "image" | "video";

/** Normalises the shapes browsers report: `jpeg` -> `jpg`, `quicktime` -> `mov`. */
export function normaliseMediaExt(raw: string | undefined): string {
  return (raw ?? "")
    .toLowerCase()
    .trim()
    .replace(/^jpeg$/, "jpg")
    .replace(/^quicktime$/, "mov")
    .replace(/^x-m4v$/, "m4v")
    .replace(/^x-matroska$/, "webm");
}

/**
 * Best-effort {kind, ext} for a picked file, or null when `allowed` accepts
 * nothing we can read out of it.
 */
export function resolveMediaDescriptor(
  file: { name: string; type: string },
  allowed: (kind: MediaKind, ext: string) => boolean,
): { kind: MediaKind; ext: string } | null {
  const mimeExt = normaliseMediaExt(file.type.split("/")[1]);
  const nameExt = normaliseMediaExt(file.name.split(".").pop());

  const declared: MediaKind | null = file.type.startsWith("image/")
    ? "image"
    : file.type.startsWith("video/")
      ? "video"
      : null;

  // A declared kind wins; an unhelpful Content-Type falls through to trying
  // both, which is what rescues the octet-stream video.
  const kinds: readonly MediaKind[] = declared
    ? [declared]
    : (["image", "video"] as const);

  for (const kind of kinds) {
    for (const ext of [mimeExt, nameExt]) {
      if (ext && allowed(kind, ext)) return { kind, ext };
    }
  }
  return null;
}
