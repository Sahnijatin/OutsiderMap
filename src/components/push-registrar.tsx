"use client";

import { useEffect } from "react";
import { registerPushNotifications } from "@/lib/native/push";

/**
 * Registers the device for push once a member is signed in, in the native app
 * only (#143 / #125). Renders nothing and is a pure no-op on the web — the
 * plugin is dynamically imported behind a native guard inside `push.ts`.
 *
 * Signed-in is required because the token is bound to the caller by
 * `/api/notifications/token`; registering while signed out would just 401.
 * Registration is idempotent, so mounting this on more than one layout is fine.
 */
export function PushRegistrar({ signedIn }: { signedIn: boolean }) {
  useEffect(() => {
    if (!signedIn) return;
    void registerPushNotifications();
  }, [signedIn]);

  return null;
}
