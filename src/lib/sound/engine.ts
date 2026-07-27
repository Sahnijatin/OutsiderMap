"use client";

import { getSoundPrefs } from "@/lib/sound/prefs";

/**
 * The app's sound engine - everything is synthesized with WebAudio, so there
 * are no audio files to load and nothing to cache. Two layers:
 *
 * - **Effects**: short, low-pass-filtered blips for deliberate moments (send,
 *   complete, error). Tuned quiet and warm - textures, not casino feedback.
 * - **Ambient**: the "Delhi night hum" - two detuned low oscillators breathing
 *   through a slow filter sweep with a whisper of pink noise. Off by default,
 *   started only from an explicit user gesture (autoplay policy), suspended
 *   while the tab is hidden.
 *
 * Every entry point is fire-and-forget and never throws: sound is a nicety,
 * so a missing AudioContext, a locked-down WebView, or a raced node teardown
 * must never affect a user flow. The context is created lazily on first use
 * (always inside a user gesture) and nothing here runs on the server.
 */

export type SoundName = "tap" | "send" | "success" | "points" | "error";

const EFFECTS_GAIN = 0.15;
const AMBIENT_GAIN = 0.05;

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
    return ctx;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

type Blip = {
  /** Oscillator frequency in Hz (start value). */
  freq: number;
  /** Offset from "now" in seconds. */
  at: number;
  /** Envelope length in seconds. */
  dur: number;
  /** Relative loudness 0..1 (scaled by EFFECTS_GAIN). */
  peak?: number;
  type?: OscillatorType;
  /** Low-pass cutoff - lower = warmer/duller. */
  cutoff?: number;
  /** Exponential pitch glide target (for the error thud). */
  glideTo?: number;
};

function playBlip(ac: AudioContext, b: Blip): void {
  const t0 = ac.currentTime + b.at;
  const osc = ac.createOscillator();
  osc.type = b.type ?? "sine";
  osc.frequency.setValueAtTime(b.freq, t0);
  if (b.glideTo) {
    osc.frequency.exponentialRampToValueAtTime(b.glideTo, t0 + b.dur);
  }

  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(b.cutoff ?? 1400, t0);
  filter.Q.value = 0.7;

  const gain = ac.createGain();
  const peak = EFFECTS_GAIN * (b.peak ?? 1);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + b.dur);

  osc.connect(filter).connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + b.dur + 0.05);
  osc.onended = () => {
    try {
      osc.disconnect();
      filter.disconnect();
      gain.disconnect();
    } catch {
      // Already torn down.
    }
  };
}

/**
 * The palette. All sine/triangle through a low-pass with fast exponential
 * decay - short enough to read as texture, warm enough to match the amber.
 */
const RECIPES: Record<SoundName, Blip[]> = {
  // A soft, warm tick - one filtered sine blip.
  tap: [{ freq: 520, at: 0, dur: 0.06, cutoff: 1100, peak: 0.9 }],
  // A gentle upward two-note (G4 to C5) - the ask leaving your hands.
  send: [
    { freq: 392, at: 0, dur: 0.09, cutoff: 1300, peak: 0.8 },
    { freq: 523.25, at: 0.07, dur: 0.12, cutoff: 1500, peak: 0.9 },
  ],
  // A quiet major arpeggio (C5 E5 G5) in warm triangles - something landed.
  success: [
    { freq: 523.25, at: 0, dur: 0.14, type: "triangle", cutoff: 1600, peak: 0.8 },
    { freq: 659.25, at: 0.09, dur: 0.16, type: "triangle", cutoff: 1600, peak: 0.8 },
    { freq: 783.99, at: 0.18, dur: 0.24, type: "triangle", cutoff: 1800, peak: 0.7 },
  ],
  // The same shape a register brighter (E5 G#5 B5) - points earned.
  points: [
    { freq: 659.25, at: 0, dur: 0.12, cutoff: 2400, peak: 0.8 },
    { freq: 830.61, at: 0.08, dur: 0.14, cutoff: 2600, peak: 0.8 },
    { freq: 987.77, at: 0.16, dur: 0.22, cutoff: 2800, peak: 0.7 },
  ],
  // A low muted thud with a downward glide - wrong, but not alarming.
  error: [{ freq: 150, at: 0, dur: 0.16, glideTo: 90, cutoff: 320, peak: 1 }],
};

/**
 * Play one UI sound. No-ops when effects are off, on the server, or when
 * audio is unavailable; never throws.
 */
export function playSound(name: SoundName): void {
  try {
    if (!getSoundPrefs().effects) return;
    const ac = getContext();
    if (!ac) return;
    for (const b of RECIPES[name]) playBlip(ac, b);
  } catch {
    // Sound must never break a flow.
  }
}

/* ------------------------------------------------------------------ */
/* Ambient - the Delhi night hum                                       */
/* ------------------------------------------------------------------ */

type AmbientRig = {
  master: GainNode;
  sources: Array<OscillatorNode | AudioBufferSourceNode>;
};

let ambient: AmbientRig | null = null;
let visibilityWatched = false;

/** ~4s of looped pink-ish noise (Paul Kellet's economy approximation). */
function pinkNoiseBuffer(ac: AudioContext): AudioBuffer {
  const length = ac.sampleRate * 4;
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.997 * b0 + 0.029591 * white;
    b1 = 0.985 * b1 + 0.032534 * white;
    b2 = 0.95 * b2 + 0.048056 * white;
    data[i] = (b0 + b1 + b2 + white * 0.05) * 0.6;
  }
  return buffer;
}

function buildAmbient(ac: AudioContext): AmbientRig {
  const master = ac.createGain();
  master.gain.setValueAtTime(0, ac.currentTime);
  master.connect(ac.destination);

  // The pad: a sine and a slightly-sharp triangle an octave down in the mix,
  // both breathing through one low-pass filter.
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 260;
  filter.Q.value = 0.9;
  filter.connect(master);

  const padGain = ac.createGain();
  padGain.gain.value = 0.8;
  padGain.connect(filter);

  const oscA = ac.createOscillator();
  oscA.type = "sine";
  oscA.frequency.value = 110; // A2 - the city's mains hum, romanticized.
  oscA.connect(padGain);

  const oscB = ac.createOscillator();
  oscB.type = "triangle";
  oscB.frequency.value = 110;
  oscB.detune.value = 7; // A few cents sharp - the slow beat between them.
  oscB.connect(padGain);

  // Two very slow LFOs: one opens and closes the filter over ~90 seconds,
  // one drifts oscB's detune so the beating itself evolves.
  const lfo = ac.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 1 / 90;
  const lfoDepth = ac.createGain();
  lfoDepth.gain.value = 140;
  lfo.connect(lfoDepth);
  lfoDepth.connect(filter.frequency);

  const drift = ac.createOscillator();
  drift.type = "sine";
  drift.frequency.value = 1 / 23;
  const driftDepth = ac.createGain();
  driftDepth.gain.value = 4;
  drift.connect(driftDepth);
  driftDepth.connect(oscB.detune);

  // A touch of band-passed pink noise - distant traffic shimmer.
  const noise = ac.createBufferSource();
  noise.buffer = pinkNoiseBuffer(ac);
  noise.loop = true;
  const noiseFilter = ac.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = 1200;
  noiseFilter.Q.value = 0.6;
  const noiseGain = ac.createGain();
  noiseGain.gain.value = 0.05;
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(master);

  const sources: AmbientRig["sources"] = [oscA, oscB, lfo, drift, noise];
  for (const s of sources) s.start();
  return { master, sources };
}

function watchVisibility(): void {
  if (visibilityWatched || typeof document === "undefined") return;
  visibilityWatched = true;
  document.addEventListener("visibilitychange", () => {
    try {
      if (!ambient || !ctx) return;
      if (document.hidden) {
        void ctx.suspend().catch(() => {});
      } else if (getSoundPrefs().music) {
        void ctx.resume().catch(() => {});
      }
    } catch {
      // Never let audio state chase break the page.
    }
  });
}

/**
 * Start (or fade back in) the ambient hum. Must be called from a user
 * gesture the first time - the settings toggle, or the armed first tap when
 * the preference was left on. No-op if the music pref is off. Never throws.
 */
export function startAmbient(): void {
  try {
    if (!getSoundPrefs().music) return;
    const ac = getContext();
    if (!ac) return;
    watchVisibility();
    if (!ambient) ambient = buildAmbient(ac);
    const g = ambient.master.gain;
    const t = ac.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(AMBIENT_GAIN, t + 2.5);
  } catch {
    // Silence is an acceptable ambience.
  }
}

/** Fade the hum out and tear the nodes down. Never throws. */
export function stopAmbient(): void {
  try {
    if (!ambient || !ctx) return;
    const ac = ctx;
    const rig = ambient;
    ambient = null;
    const g = rig.master.gain;
    const t = ac.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + 0.8);
    setTimeout(() => {
      try {
        for (const s of rig.sources) s.stop();
        rig.master.disconnect();
      } catch {
        // Already stopped.
      }
    }, 1000);
  } catch {
    // Silence is an acceptable ambience.
  }
}
