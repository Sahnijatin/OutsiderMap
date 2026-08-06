"use client";

import { useSyncExternalStore } from "react";
import { TOUR_STEP_COUNT, TOUR_VERSION } from "@/lib/tour/steps";

/**
 * Guided tour state, as a module-level external store rather than a React
 * context.
 *
 * The tour walks from /map - which lives in (public) - to five surfaces in
 * (shell). Those two layouts are siblings in the router tree, so crossing the
 * boundary unmounts one and mounts the other: a provider in either would lose
 * its state at exactly the step that needs it. A provider in the root layout
 * would survive, but buys nothing this doesn't, and would drag marketing and
 * auth pages inside it. A module store survives both, survives a hard reload
 * via sessionStorage, and lets unrelated code (the map's welcome card, the
 * profile replay button) drive the tour without prop-drilling.
 *
 * sessionStorage, not localStorage: the durable "never show this again" fact
 * lives in profiles.tour_completed_at. This mirror only has to survive a reload
 * inside one session, and localStorage would resurrect a half-finished tour
 * weeks later on a shared laptop.
 *
 * The mirror records ENDED tours as well as in-flight ones. The two facts have
 * different owners - the database owns "ever", this owns "this session" - and
 * dropping the second one means a member who skips and then reloads before the
 * POST lands (offline, rate-limited, or just slow) gets the tour thrown at them
 * again by the still-stale server profile. `pending` remembers that the write
 * is owed so the next mount can retry it.
 */

export type TourStatus = "idle" | "armed" | "running" | "finished";
export type TourMode = "auto" | "replay";
export type TourState = {
  status: TourStatus;
  /** Index into TOUR_STEPS. Only meaningful while running. */
  step: number;
  mode: TourMode;
};

/** Why the tour ended. All four mean "don't show it unprompted again". */
export type TourEndReason = "finished" | "skipped" | "abandoned" | "failed";

export const TOUR_STATE_DEFAULT: TourState = Object.freeze({
  status: "idle",
  step: 0,
  mode: "auto",
});

const STORAGE_KEY = "om.tour.v1";

let cached: TourState | null = null;
const listeners = new Set<() => void>();
/**
 * Surfaces that must own the screen before the tour may start (the map's
 * welcome card, an open place sheet). Keyed, so a double-register from
 * StrictMode's double-invoked effects is harmless.
 */
const blockers = new Set<string>();
let completeInFlight = false;
/** The completion write is owed - it has not been confirmed by a 2xx yet. */
let completeOwed = false;
/** Retries are cheap but not free; three attempts per page load is plenty. */
let completeAttempts = 0;
const MAX_COMPLETE_ATTEMPTS = 3;

function isTourStatus(value: unknown): value is TourStatus {
  return (
    value === "idle" ||
    value === "armed" ||
    value === "running" ||
    value === "finished"
  );
}

function readStorage(): TourState {
  try {
    if (typeof sessionStorage === "undefined") return TOUR_STATE_DEFAULT;
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return TOUR_STATE_DEFAULT;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // A payload from an older build points at steps that may no longer exist.
    if (parsed.v !== TOUR_VERSION) return TOUR_STATE_DEFAULT;
    if (!isTourStatus(parsed.status)) return TOUR_STATE_DEFAULT;
    const mode: TourMode = parsed.mode === "replay" ? "replay" : "auto";
    completeOwed = parsed.pending === true;
    // An ended tour stays ended for the rest of this session, whatever the
    // server profile says. The server may not know yet.
    if (parsed.status === "finished") {
      return { status: "finished", step: 0, mode };
    }
    // Of the rest only an in-flight tour is worth resuming.
    if (parsed.status !== "running") return TOUR_STATE_DEFAULT;
    const step =
      typeof parsed.step === "number" && Number.isInteger(parsed.step)
        ? Math.min(Math.max(parsed.step, 0), TOUR_STEP_COUNT - 1)
        : 0;
    return { status: "running", step, mode };
  } catch {
    return TOUR_STATE_DEFAULT;
  }
}

function writeStorage(state: TourState): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    if (state.status !== "running" && state.status !== "finished") {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: TOUR_VERSION, ...state, pending: completeOwed }),
    );
  } catch {
    // Private mode / quota - the in-memory state still drives this session.
  }
}

/** Record whether the completion write is still owed, and mirror it. */
function setOwed(owed: boolean): void {
  if (completeOwed === owed) return;
  completeOwed = owed;
  writeStorage(getTourState());
}

function emit(): void {
  for (const listener of [...listeners]) listener();
}

/**
 * Current state. Returns the cached object, never a fresh literal - a new
 * reference per call makes useSyncExternalStore loop forever.
 */
export function getTourState(): TourState {
  if (!cached) cached = readStorage();
  return cached;
}

function setState(next: TourState): void {
  const current = getTourState();
  if (
    current.status === next.status &&
    current.step === next.step &&
    current.mode === next.mode
  ) {
    return;
  }
  cached = next;
  writeStorage(next);
  emit();
}

/** Subscribe to tour changes (useSyncExternalStore-compatible). */
export function subscribeTour(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

// Server + first client render agree on the defaults (no hydration mismatch);
// a resumed tour applies right after hydration.
const getServerSnapshot = () => TOUR_STATE_DEFAULT;

export function useTourState(): TourState {
  return useSyncExternalStore(subscribeTour, getTourState, getServerSnapshot);
}

function getBlockedSnapshot(): boolean {
  return blockers.size > 0;
}
const getBlockedServerSnapshot = () => false;

/** Whether some surface is currently holding the tour off. */
export function useTourBlocked(): boolean {
  return useSyncExternalStore(
    subscribeTour,
    getBlockedSnapshot,
    getBlockedServerSnapshot,
  );
}

/**
 * Tell the store what the server knows: whether this member is owed the
 * first-run tour. Idempotent, because the effect that calls it double-invokes
 * under StrictMode and re-runs on every cross-group navigation.
 */
export function syncTourEligibility(eligible: boolean): void {
  const state = getTourState();
  if (eligible) {
    if (state.status === "idle") {
      setState({ status: "armed", step: 0, mode: "auto" });
    }
    return;
  }
  // Not eligible. A replay was started deliberately from settings and the
  // server will always say "completed" for it, so leave that one alone.
  if (state.mode === "replay") return;
  // The server already knows, so nothing is owed - and the session mirror can
  // go, since the durable fact now carries the weight on its own.
  if (state.status !== "idle") setState(TOUR_STATE_DEFAULT);
  setOwed(false);
}

/**
 * Re-attempt a completion write that never landed. Called on mount, so a
 * dismissal that happened offline still reaches the server the moment the
 * member navigates with a connection.
 */
export function retryTourCompletion(): void {
  getTourState(); // forces the storage read that populates `completeOwed`
  if (!completeOwed) return;
  persistCompletion();
}

export function startTour(mode: TourMode): void {
  const state = getTourState();
  if (state.status === "running") return;
  setState({ status: "running", step: 0, mode });
}

export function goToStep(index: number): void {
  const state = getTourState();
  if (state.status !== "running") return;
  const step = Math.min(Math.max(index, 0), TOUR_STEP_COUNT - 1);
  setState({ ...state, step });
}

export function nextStep(): void {
  const state = getTourState();
  if (state.status !== "running") return;
  if (state.step >= TOUR_STEP_COUNT - 1) {
    endTour("finished");
    return;
  }
  setState({ ...state, step: state.step + 1 });
}

export function prevStep(): void {
  const state = getTourState();
  if (state.status !== "running") return;
  if (state.step === 0) return;
  setState({ ...state, step: state.step - 1 });
}

/**
 * End the tour and persist that it was served. Finishing, skipping, walking
 * away and giving up all land here: a tour you dismissed must never ask again,
 * and the profile settings card is the way back in.
 */
export function endTour(reason: TourEndReason): void {
  const state = getTourState();
  if (state.status === "finished") return;
  const wasStarted = state.status === "running";
  setState({ status: "finished", step: 0, mode: state.mode });
  if (!wasStarted) return;
  void reason;
  persistCompletion();
}

function persistCompletion(): void {
  if (completeInFlight) return;
  if (typeof fetch === "undefined") return;
  if (completeAttempts >= MAX_COMPLETE_ATTEMPTS) return;
  completeInFlight = true;
  completeAttempts += 1;
  // Owed until a 2xx says otherwise. Written BEFORE the request so a member who
  // closes the tab mid-flight still has the retry queued for next time.
  setOwed(true);
  // keepalive: a skip is usually followed straight away by a navigation, and
  // without it the browser may cancel the request in flight. A failure is not
  // fatal - sessionStorage has ended the tour for this session either way, and
  // retryTourCompletion() picks the write back up on the next mount.
  void fetch("/api/tour", { method: "POST", keepalive: true })
    .then((response) => {
      if (response.ok) setOwed(false);
    })
    .catch(() => {})
    .finally(() => {
      completeInFlight = false;
    });
}

/**
 * Hold the tour off while some surface owns the screen. Returns the release.
 * Keyed so double-registering the same surface is safe.
 */
export function blockTour(key: string): () => void {
  blockers.add(key);
  emit();
  return () => {
    blockers.delete(key);
    emit();
  };
}

/** Test-only: drop all in-memory state so the next read hits storage again. */
export function resetTourStoreForTests(): void {
  cached = null;
  blockers.clear();
  completeInFlight = false;
  completeOwed = false;
  completeAttempts = 0;
  listeners.clear();
}
