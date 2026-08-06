import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOUR_STEP_COUNT, TOUR_VERSION } from "@/lib/tour/steps";
import {
  blockTour,
  endTour,
  getTourState,
  goToStep,
  nextStep,
  prevStep,
  resetTourStoreForTests,
  retryTourCompletion,
  startTour,
  subscribeTour,
  syncTourEligibility,
  TOUR_STATE_DEFAULT,
} from "@/lib/tour/store";

/** A minimal sessionStorage double - just the surface store.ts touches. */
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal("sessionStorage", storage);
  // endTour posts to /api/tour; never let a unit test hit the network.
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  resetTourStoreForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetTourStoreForTests();
});

describe("snapshot stability", () => {
  it("returns the same reference until something changes", () => {
    // The useSyncExternalStore contract. A fresh object per call is an
    // infinite render loop, not a subtle bug.
    expect(getTourState()).toBe(getTourState());
  });

  it("returns a new reference after a change", () => {
    const before = getTourState();
    syncTourEligibility(true);
    expect(getTourState()).not.toBe(before);
  });

  it("starts at the defaults", () => {
    expect(getTourState()).toEqual(TOUR_STATE_DEFAULT);
  });
});

describe("eligibility", () => {
  it("arms when the server says the member is owed the tour", () => {
    syncTourEligibility(true);
    expect(getTourState().status).toBe("armed");
  });

  it("is idempotent", () => {
    syncTourEligibility(true);
    const armed = getTourState();
    syncTourEligibility(true);
    expect(getTourState()).toBe(armed);
  });

  it("disarms and clears storage when the server says otherwise", () => {
    syncTourEligibility(true);
    startTour("auto");
    syncTourEligibility(false);
    expect(getTourState()).toEqual(TOUR_STATE_DEFAULT);
    expect(storage.getItem("om.tour.v1")).toBeNull();
  });

  it("leaves a replay alone", () => {
    // A replay is started deliberately from settings, and the server will
    // always report that member as already done.
    startTour("replay");
    syncTourEligibility(false);
    expect(getTourState().status).toBe("running");
    expect(getTourState().mode).toBe("replay");
  });
});

describe("stepping", () => {
  beforeEach(() => {
    syncTourEligibility(true);
    startTour("auto");
  });

  it("advances through every step", () => {
    for (let i = 1; i < TOUR_STEP_COUNT; i += 1) {
      nextStep();
      expect(getTourState().step).toBe(i);
    }
    expect(getTourState().status).toBe("running");
  });

  it("finishes past the last step", () => {
    for (let i = 0; i < TOUR_STEP_COUNT; i += 1) nextStep();
    expect(getTourState().status).toBe("finished");
  });

  it("is terminal once finished", () => {
    endTour("skipped");
    nextStep();
    prevStep();
    expect(getTourState().status).toBe("finished");
  });

  it("does not go back past the first step", () => {
    prevStep();
    expect(getTourState().step).toBe(0);
  });

  it("goes back", () => {
    nextStep();
    prevStep();
    expect(getTourState().step).toBe(0);
  });

  it("clamps goToStep to the valid range", () => {
    goToStep(99);
    expect(getTourState().step).toBe(TOUR_STEP_COUNT - 1);
    goToStep(-4);
    expect(getTourState().step).toBe(0);
  });

  it("ignores stepping when not running", () => {
    endTour("skipped");
    resetTourStoreForTests(); // a reload: ended stays ended
    expect(getTourState().status).toBe("finished");
    nextStep();
    goToStep(3);
    expect(getTourState()).toEqual({
      status: "finished",
      step: 0,
      mode: "auto",
    });
  });

  it("ignores stepping from a clean idle state", () => {
    sessionStorage.clear();
    resetTourStoreForTests();
    nextStep();
    expect(getTourState().status).toBe("idle");
  });
});

describe("blockers", () => {
  it("reports nothing blocking by default", () => {
    const release = blockTour("map-welcome");
    release();
    expect(getTourState().status).toBe("idle");
  });

  it("survives a double-register of the same key", () => {
    const releaseA = blockTour("map-welcome");
    const releaseB = blockTour("map-welcome");
    releaseA();
    releaseB();
    // Keyed, so the second register/release pair is a no-op rather than
    // leaving a phantom blocker behind.
    expect(() => releaseB()).not.toThrow();
  });

  it("notifies subscribers when a blocker is added or released", () => {
    const seen = vi.fn();
    subscribeTour(seen);
    const release = blockTour("place-sheet");
    expect(seen).toHaveBeenCalledTimes(1);
    release();
    expect(seen).toHaveBeenCalledTimes(2);
  });
});

describe("persistence", () => {
  it("resumes an in-flight tour after a reload", () => {
    startTour("auto");
    nextStep();
    nextStep();
    resetTourStoreForTests(); // simulates a fresh page load
    expect(getTourState()).toEqual({
      status: "running",
      step: 2,
      mode: "auto",
    });
  });

  it("stays finished across a reload, so a skip never comes back", () => {
    // The whole point: the durable fact is in the database, but the POST that
    // sets it may not have landed yet. If the reload started clean, a stale
    // server profile would re-arm and the tour a member just dismissed would
    // walk back in.
    startTour("auto");
    endTour("skipped");
    resetTourStoreForTests();
    expect(getTourState()).toEqual({
      status: "finished",
      step: 0,
      mode: "auto",
    });
  });

  it("does not resume a finished tour at the step it died on", () => {
    startTour("auto");
    nextStep();
    nextStep();
    endTour("skipped");
    resetTourStoreForTests();
    expect(getTourState().step).toBe(0);
  });

  it("discards a payload from an older build", () => {
    storage.setItem(
      "om.tour.v1",
      JSON.stringify({ v: TOUR_VERSION + 1, status: "running", step: 3 }),
    );
    resetTourStoreForTests();
    expect(getTourState()).toEqual(TOUR_STATE_DEFAULT);
  });

  it("discards a corrupt payload", () => {
    storage.setItem("om.tour.v1", "{not json");
    resetTourStoreForTests();
    expect(getTourState()).toEqual(TOUR_STATE_DEFAULT);
  });

  it("clamps an out-of-range stored step", () => {
    storage.setItem(
      "om.tour.v1",
      JSON.stringify({ v: TOUR_VERSION, status: "running", step: 99 }),
    );
    resetTourStoreForTests();
    expect(getTourState().step).toBe(TOUR_STEP_COUNT - 1);
  });
});

describe("degraded storage", () => {
  it("works with no sessionStorage at all (SSR)", () => {
    vi.stubGlobal("sessionStorage", undefined);
    resetTourStoreForTests();
    expect(getTourState()).toEqual(TOUR_STATE_DEFAULT);
    expect(() => startTour("auto")).not.toThrow();
    expect(getTourState().status).toBe("running");
  });

  it("works when setItem throws (private mode)", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
    });
    resetTourStoreForTests();
    expect(() => startTour("auto")).not.toThrow();
    expect(getTourState().status).toBe("running");
  });
});

describe("completion", () => {
  it("persists once when the tour ends", () => {
    startTour("auto");
    endTour("finished");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/tour", {
      method: "POST",
      keepalive: true,
    });
  });

  it("does not persist twice", () => {
    startTour("auto");
    endTour("skipped");
    endTour("finished");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not persist a tour that never started", () => {
    syncTourEligibility(true);
    endTour("abandoned");
    expect(fetch).not.toHaveBeenCalled();
  });
});

/** Let the fetch chain (.then/.catch/.finally) settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("owed completions", () => {
  it("retries on the next mount when the write failed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    startTour("auto");
    endTour("skipped");
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);

    // A fresh page load: the in-memory flag is gone, but the mirror remembers.
    resetTourStoreForTests();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    retryTourCompletion();
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("stops retrying once the server has it", async () => {
    startTour("auto");
    endTour("finished");
    await flush();

    resetTourStoreForTests();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    retryTourCompletion();
    await flush();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("treats a non-2xx as still owed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    startTour("auto");
    endTour("skipped");
    await flush();

    resetTourStoreForTests();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    retryTourCompletion();
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("gives up rather than hammering the endpoint forever", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    startTour("auto");
    endTour("skipped");
    await flush();
    for (let i = 0; i < 10; i += 1) {
      retryTourCompletion();
      await flush();
    }
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
