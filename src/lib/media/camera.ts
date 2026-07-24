"use client";

import { isNativeApp } from "@/lib/capacitor/platform";

/**
 * Native photo capture (#143 plugins track; Scout #80, Feed #67).
 *
 * On the web, surfaces keep their `<input type="file">` - nothing changes. In
 * the Capacitor app this opens the real native camera / photo picker, with OS
 * permission handling, and hands back a plain `File` so every existing upload
 * path works unchanged.
 *
 * `@capacitor/camera` is dynamically imported so it never enters the web bundle
 * (same pattern as `native-social.ts` / `geolocation.ts`).
 *
 * We request `DataUrl` rather than `Uri`: this is a *hybrid* shell (the WebView
 * loads the hosted site), so a `capacitor://` file URL would be cross-origin to
 * the page and `fetch` could be blocked. A data URL converts to a File purely
 * in-page, with no network read - reliable regardless of origin.
 */

/** Where the photo comes from. `camera` forces a live shot (no gallery). */
export type PhotoSource = "camera" | "library" | "prompt";

/** Long edge cap + JPEG quality - keeps the base64 payload sane on device. */
const MAX_WIDTH = 2048;
const QUALITY = 82;

function dataUrlToFile(dataUrl: string, filename: string): File {
  const comma = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, comma);
  const base64 = dataUrl.slice(comma + 1);
  const mime = /data:([^;]+)/.exec(meta)?.[1] ?? "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

function extensionFor(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

/** True when the native camera is available (i.e. we're in the app). */
export function isNativeCameraAvailable(): Promise<boolean> {
  return isNativeApp();
}

/**
 * Open the native camera / picker and return the photo as a `File`.
 * Returns `null` when the user cancels, or when called on the web (callers
 * should fall back to their file input). Throws only on a real failure -
 * e.g. permission permanently denied.
 */
export async function captureNativePhoto(
  source: PhotoSource = "prompt",
): Promise<File | null> {
  if (!(await isNativeApp())) return null;

  const { Camera, CameraResultType, CameraSource } = await import(
    "@capacitor/camera"
  );

  // Ask only for what this source needs, so a library pick doesn't demand the
  // camera permission (and vice versa).
  const perms = await Camera.checkPermissions();
  const needsCamera = source !== "library";
  const needsPhotos = source !== "camera";
  const missing =
    (needsCamera && perms.camera !== "granted") ||
    (needsPhotos && perms.photos !== "granted" && perms.photos !== "limited");
  if (missing) {
    const requested = await Camera.requestPermissions({
      permissions: needsCamera && needsPhotos
        ? ["camera", "photos"]
        : needsCamera
          ? ["camera"]
          : ["photos"],
    });
    const stillMissing =
      (needsCamera && requested.camera !== "granted") ||
      (needsPhotos &&
        requested.photos !== "granted" &&
        requested.photos !== "limited");
    if (stillMissing) {
      throw new Error(
        "Camera access is off. Turn it on for OutsiderMap in Settings.",
      );
    }
  }

  try {
    const photo = await Camera.getPhoto({
      quality: QUALITY,
      width: MAX_WIDTH,
      correctOrientation: true,
      allowEditing: false,
      saveToGallery: false,
      resultType: CameraResultType.DataUrl,
      source:
        source === "camera"
          ? CameraSource.Camera
          : source === "library"
            ? CameraSource.Photos
            : CameraSource.Prompt,
    });
    if (!photo.dataUrl) return null;
    const mime = /data:([^;]+)/.exec(photo.dataUrl)?.[1] ?? "image/jpeg";
    return dataUrlToFile(
      photo.dataUrl,
      `capture-${Date.now()}.${extensionFor(mime)}`,
    );
  } catch (e) {
    // The plugin throws on dismissal - that's a normal outcome, not an error.
    const msg = e instanceof Error ? e.message : String(e);
    if (/cancel/i.test(msg) || /no image/i.test(msg)) return null;
    throw e;
  }
}
