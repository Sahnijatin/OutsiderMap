"use client";

import { useEffect } from "react";
import { startAmbient } from "@/lib/sound/engine";
import { getSoundPrefs } from "@/lib/sound/prefs";

/**
 * Resumes the ambient night hum for members who left "Background music" on.
 * Browsers only allow audio after a user gesture, so this never autoplays -
 * it arms a one-time listener and the first tap or keypress starts the pad.
 * Renders nothing; a no-op when the preference is off (the default).
 */
export function SoundBoot() {
  useEffect(() => {
    if (!getSoundPrefs().music) return;
    const arm = () => startAmbient();
    window.addEventListener("pointerdown", arm, { once: true, passive: true });
    window.addEventListener("keydown", arm, { once: true });
    return () => {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, []);
  return null;
}
