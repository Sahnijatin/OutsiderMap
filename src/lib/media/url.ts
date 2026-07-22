/**
 * Public Supabase Storage URLs, buildable on client or server. Only for
 * public-read buckets (place-images, experience-media, reel-media) - private
 * buckets need signed URLs instead.
 */
export function publicMediaUrl(
  bucket: "place-images" | "experience-media" | "reel-media" | "post-media",
  path: string | null | undefined,
): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}
