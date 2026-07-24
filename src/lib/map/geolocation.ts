"use client";

/**
 * Device geolocation with a native path (#143 plugins track). On the web this is
 * `navigator.geolocation`; in the Capacitor native app it's `@capacitor/geolocation`
 * — real device GPS with a proper native permission prompt (the WebView's
 * `navigator.geolocation` is unreliable on iOS WKWebView, which is why the plugin
 * exists). Capacitor is dynamically imported so nothing native enters the web
 * bundle, mirroring `src/lib/auth/native-social.ts`.
 *
 * The single seam every location consumer should use, so the web behaviour stays
 * identical and native just works.
 */

export type DevicePosition = {
  latitude: number;
  longitude: number;
  /** Accuracy radius in metres, when the platform reports it. */
  accuracy: number | null;
};

const DEFAULT_TIMEOUT_MS = 15_000;

/** True on the Capacitor native shell. Async so callers get the right value at
 *  call time (not a mount-time snapshot), which matters inside the map effect. */
export async function isNativeApp(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * One-shot current position. Native uses the Capacitor plugin (prompting for
 * permission if needed); web uses `navigator.geolocation`. Rejects if location
 * is unavailable or permission is denied.
 */
export async function getDevicePosition(
  opts: { timeoutMs?: number } = {},
): Promise<DevicePosition> {
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (await isNativeApp()) {
    const { Geolocation } = await import("@capacitor/geolocation");
    let perm = await Geolocation.checkPermissions();
    if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
      perm = await Geolocation.requestPermissions();
    }
    if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
      throw new Error("Location permission is off. Turn it on in Settings.");
    }
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout,
    });
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
    };
  }

  return new Promise<DevicePosition>((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Location isn't available on this device."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: Number.isFinite(p.coords.accuracy)
            ? p.coords.accuracy
            : null,
        }),
      reject,
      { enableHighAccuracy: true, timeout },
    );
  });
}

/**
 * Whether location permission is *already* granted — so a surface can locate
 * without raising a prompt on load (#116's "no nagging" policy). Native → the
 * plugin's `checkPermissions`; web → the Permissions API. Never prompts.
 */
export async function hasLocationPermission(): Promise<boolean> {
  if (await isNativeApp()) {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const perm = await Geolocation.checkPermissions();
      return perm.location === "granted" || perm.coarseLocation === "granted";
    } catch {
      return false;
    }
  }
  try {
    const status = await navigator.permissions?.query({
      name: "geolocation" as PermissionName,
    });
    return status?.state === "granted";
  } catch {
    return false;
  }
}
