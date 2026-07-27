"use client";

import { useSyncExternalStore } from "react";

/**
 * The "feel" preferences: UI sound effects, the ambient night hum, and
 * haptics. Persisted in localStorage, exposed through a tiny external store so
 * the settings switches, the sound engine, and the haptics seam all read the
 * same truth without a provider.
 *
 * Defaults hold the design line: effects on (subtle textures), music off
 * (never autoplay a vibe on someone), haptics on (native only anyway).
 * Everything is guarded so a server render, a private-mode browser, or a
 * corrupt stored value silently falls back to the defaults.
 */

export type SoundPrefs = {
  effects: boolean;
  music: boolean;
  haptics: boolean;
};

export const SOUND_PREF_DEFAULTS: SoundPrefs = Object.freeze({
  effects: true,
  music: false,
  haptics: true,
});

const STORAGE_KEY = "om.feel.v1";

let cached: SoundPrefs | null = null;
const listeners = new Set<() => void>();

function readStorage(): SoundPrefs {
  try {
    if (typeof localStorage === "undefined") return { ...SOUND_PREF_DEFAULTS };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...SOUND_PREF_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<
      Record<keyof SoundPrefs, unknown>
    >;
    return {
      effects:
        typeof parsed.effects === "boolean"
          ? parsed.effects
          : SOUND_PREF_DEFAULTS.effects,
      music:
        typeof parsed.music === "boolean"
          ? parsed.music
          : SOUND_PREF_DEFAULTS.music,
      haptics:
        typeof parsed.haptics === "boolean"
          ? parsed.haptics
          : SOUND_PREF_DEFAULTS.haptics,
    };
  } catch {
    return { ...SOUND_PREF_DEFAULTS };
  }
}

/** Current prefs (cached after first read; referentially stable per version). */
export function getSoundPrefs(): SoundPrefs {
  if (!cached) cached = readStorage();
  return cached;
}

/** Flip one preference, persist it, and notify subscribers. Never throws. */
export function setSoundPref(key: keyof SoundPrefs, value: boolean): void {
  const next = { ...getSoundPrefs(), [key]: value };
  cached = next;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // Private mode / quota - the in-memory value still works this session.
  }
  for (const listener of [...listeners]) listener();
}

/** Subscribe to pref changes (useSyncExternalStore-compatible). */
export function subscribeSoundPrefs(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

// Server + first client render agree on the defaults (no hydration mismatch);
// the stored values apply right after hydration.
const getServerSnapshot = () => SOUND_PREF_DEFAULTS;

/** The prefs as reactive state - for the settings switches. */
export function useSoundPrefs(): SoundPrefs {
  return useSyncExternalStore(
    subscribeSoundPrefs,
    getSoundPrefs,
    getServerSnapshot,
  );
}

/** Test-only: drop the in-memory cache so the next read hits storage again. */
export function resetSoundPrefsForTests(): void {
  cached = null;
}
