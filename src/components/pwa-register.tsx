"use client";

import { useEffect } from "react";

/** Registers the service worker; renders nothing. Lives in the root layout. */
export function PwaRegister() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production"
    ) {
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Install-shell nicety only; the app is fully functional without it.
    });
  }, []);
  return null;
}
