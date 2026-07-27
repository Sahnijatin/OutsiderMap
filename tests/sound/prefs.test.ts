import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSoundPrefs,
  resetSoundPrefsForTests,
  setSoundPref,
  SOUND_PREF_DEFAULTS,
  subscribeSoundPrefs,
} from "@/lib/sound/prefs";

/** A minimal localStorage double - just the surface prefs.ts touches. */
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
  resetSoundPrefsForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetSoundPrefsForTests();
});

describe("sound prefs", () => {
  it("defaults to effects on, music off, haptics on", () => {
    expect(getSoundPrefs()).toEqual({
      effects: true,
      music: false,
      haptics: true,
    });
    expect(SOUND_PREF_DEFAULTS).toEqual({
      effects: true,
      music: false,
      haptics: true,
    });
  });

  it("falls back to defaults when localStorage is unavailable (SSR)", () => {
    vi.stubGlobal("localStorage", undefined);
    resetSoundPrefsForTests();
    expect(getSoundPrefs()).toEqual(SOUND_PREF_DEFAULTS);
    // Writing without storage still updates the in-memory value, silently.
    expect(() => setSoundPref("music", true)).not.toThrow();
    expect(getSoundPrefs().music).toBe(true);
  });

  it("persists a change and reads it back after a cache reset", () => {
    setSoundPref("music", true);
    setSoundPref("haptics", false);

    // Simulate a fresh page load: drop the in-memory cache, re-read storage.
    resetSoundPrefsForTests();
    expect(getSoundPrefs()).toEqual({
      effects: true,
      music: true,
      haptics: false,
    });
  });

  it("ignores corrupt or partial stored values", () => {
    localStorage.setItem("om.feel.v1", "{not json");
    resetSoundPrefsForTests();
    expect(getSoundPrefs()).toEqual(SOUND_PREF_DEFAULTS);

    localStorage.setItem("om.feel.v1", JSON.stringify({ music: "yes", effects: false }));
    resetSoundPrefsForTests();
    expect(getSoundPrefs()).toEqual({
      effects: false,
      music: SOUND_PREF_DEFAULTS.music,
      haptics: SOUND_PREF_DEFAULTS.haptics,
    });
  });

  it("notifies subscribers on change and stops after unsubscribe", () => {
    const seen: boolean[] = [];
    const unsubscribe = subscribeSoundPrefs(() => {
      seen.push(getSoundPrefs().effects);
    });

    setSoundPref("effects", false);
    expect(seen).toEqual([false]);

    unsubscribe();
    setSoundPref("effects", true);
    expect(seen).toEqual([false]);
  });

  it("returns a stable snapshot between writes (useSyncExternalStore-safe)", () => {
    const a = getSoundPrefs();
    const b = getSoundPrefs();
    expect(a).toBe(b);
    setSoundPref("music", true);
    const c = getSoundPrefs();
    expect(c).not.toBe(a);
    expect(getSoundPrefs()).toBe(c);
  });
});
