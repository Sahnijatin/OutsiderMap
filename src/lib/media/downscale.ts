/**
 * Shrink a photo in the browser before it is uploaded.
 *
 * Two reasons, and the second is the one that matters:
 *
 *   1. Size limits. A Server Action request body is capped (1MB by default,
 *      4.5MB on Vercel however it is configured), and a modern phone photo is
 *      3-8MB. Uploads were failing before they left the page.
 *
 *   2. The person uploading. Most of this app's contributors are standing in a
 *      market on mobile data. Sending 8MB to show a picture of a plate of
 *      kebabs is a minute of their time and their bandwidth for no visible
 *      gain - a 2000px JPEG is indistinguishable in a gallery and lands in a
 *      couple of seconds.
 *
 * Returns the original file untouched if anything goes wrong, or if it is
 * already small. A slightly-too-big upload beats a failed one.
 */

/** Longest edge, in pixels, after downscaling. */
const MAX_EDGE = 2000;
/** Files at or below this are already fine; do not re-encode and lose quality. */
const SKIP_BELOW_BYTES = 900 * 1024;
const JPEG_QUALITY = 0.85;

export async function downscaleImage(file: File): Promise<File> {
  if (typeof window === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= SKIP_BELOW_BYTES) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;

    // Already small enough in pixels, but heavy in bytes - re-encoding at
    // native size still wins.
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    // HEIC in, JPEG out - the extension has to follow or the server rejects
    // the mismatch.
    const base = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${base}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}
