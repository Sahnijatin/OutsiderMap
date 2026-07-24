"use client";

import { isNativeApp } from "@/lib/capacitor/platform";

/**
 * Native push registration (#143 plugins track; proactive layer #125).
 *
 * The server side already exists: `POST/DELETE /api/notifications/token` stores
 * device tokens, and `lib/notifications/frequency.ts` holds the send rules. This
 * is the missing client half — ask for permission, register with APNs/FCM, and
 * hand the token to that endpoint.
 *
 * Delivery additionally needs credentials we don't have yet (an APNs key for
 * iOS, `google-services.json` for Android). Until those exist `register()` just
 * fails at runtime, which we swallow: no crashes, no bogus tokens, and the
 * moment the credentials land this starts working with no code change.
 *
 * Nothing here runs on the web — the plugin is dynamically imported behind an
 * `isNativeApp()` guard, so it never enters the web bundle.
 */

export type PushRegistration =
  | "registered"
  | "denied"
  /** Not the native app, or the plugin/credentials aren't available. */
  | "unavailable";

/** Registering twice would stack duplicate listeners. */
let started = false;
let currentToken: string | null = null;

async function sendToken(token: string, platform: "ios" | "android") {
  await fetch("/api/notifications/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, platform }),
  });
}

/**
 * Ask for notification permission and register the device. Safe to call more
 * than once (subsequent calls are a no-op) and safe to call when signed out —
 * though the token only binds to a user when the request is authenticated, so
 * callers should register after sign-in.
 */
export async function registerPushNotifications(): Promise<PushRegistration> {
  if (started) return "registered";
  try {
    if (!(await isNativeApp())) return "unavailable";

    const [{ PushNotifications }, { Capacitor }] = await Promise.all([
      import("@capacitor/push-notifications"),
      import("@capacitor/core"),
    ]);
    const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android";

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") return "denied";

    started = true;

    await PushNotifications.addListener("registration", (token) => {
      currentToken = token.value;
      void sendToken(token.value, platform).catch(() => {
        // Offline or signed out — the next registration will retry.
      });
    });

    await PushNotifications.addListener("registrationError", () => {
      // Missing APNs/FCM credentials land here. Nothing to do but stay quiet.
      started = false;
    });

    // Tapping a notification should take the member where it points.
    await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action) => {
        const url = action.notification.data?.url;
        if (typeof url === "string" && url.startsWith("/")) {
          window.location.assign(url);
        }
      },
    );

    await PushNotifications.register();
    return "registered";
  } catch {
    started = false;
    return "unavailable";
  }
}

/**
 * Drop this device's token — call on sign-out so a shared phone stops receiving
 * the previous member's notifications.
 */
export async function unregisterPushNotifications(): Promise<void> {
  const token = currentToken;
  currentToken = null;
  started = false;
  if (!token) return;
  try {
    await fetch("/api/notifications/token", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch {
    // Best-effort; the server re-binds the token on the next registration.
  }
}
