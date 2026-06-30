import "server-only";

/**
 * Bucket-agnostic image helpers shared by the vetting (private) and experience
 * (public) media paths. Uploads are user-controlled, so callers identify a file
 * by its magic bytes here rather than trusting the client Content-Type.
 */

export const IMAGE_EXT_MIME = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

export type ImageExt = keyof typeof IMAGE_EXT_MIME;

/**
 * Identifies an image by its magic bytes. Returns the canonical extension, or
 * null if the bytes aren't an allowed image.
 */
export async function sniffImageExt(file: File): Promise<ImageExt | null> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  )
    return "png";
  // WEBP: "RIFF"...."WEBP"
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return "webp";
  return null;
}
