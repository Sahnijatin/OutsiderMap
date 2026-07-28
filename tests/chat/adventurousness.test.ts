import { describe, expect, it } from "vitest";
import { deriveAdventurousness } from "@/lib/chat/adventurousness";

describe("deriveAdventurousness", () => {
  it("leans explore for cold-start users", () => {
    const dial = deriveAdventurousness({ event_count: 2 });
    expect(dial.posture).toBe("explore");
    expect(dial.guidance).toContain("ground every pick");
  });

  it("tilts exploit when taste is concentrated (one vibe, one area)", () => {
    const dial = deriveAdventurousness({
      event_count: 40,
      top_vibes: [
        { tag: "quiet", score: 30 },
        { tag: "old-school", score: 3 },
      ],
      top_areas: ["GK"],
    });
    expect(dial.posture).toBe("exploit");
    expect(dial.score).toBeLessThan(0.4);
  });

  it("tilts explore for a broad palate across areas", () => {
    const dial = deriveAdventurousness({
      event_count: 40,
      top_vibes: [
        { tag: "a", score: 5 },
        { tag: "b", score: 5 },
        { tag: "c", score: 4 },
        { tag: "d", score: 4 },
        { tag: "e", score: 3 },
      ],
      top_areas: ["GK", "Hauz Khas", "CP"],
    });
    expect(dial.posture).toBe("explore");
    expect(dial.score).toBeGreaterThan(0.6);
  });

  it("is defensive about malformed signals", () => {
    expect(deriveAdventurousness(null).posture).toBe("explore"); // cold start
    expect(deriveAdventurousness("garbage").posture).toBe("explore");
    expect(deriveAdventurousness({ event_count: 40 }).posture).toBe("balanced");
  });
});

describe("deriveAdventurousness - the quiz prior", () => {
  it("seeds the dial from the quiz before there is behaviour to read", () => {
    // The gap this closes: every member under the event threshold used to get
    // the same 0.65/explore, so the window where someone is most likely to
    // judge the product as generic was exactly the window it treated them as a
    // default - even though the quiz had already asked the question directly.
    const homebody = deriveAdventurousness(
      { event_count: 0 },
      { adventurousness: 0.15 },
    );
    expect(homebody.posture).toBe("exploit");
    expect(homebody.score).toBe(0.15);

    const hunter = deriveAdventurousness(
      { event_count: 0 },
      { adventurousness: 0.9 },
    );
    expect(hunter.posture).toBe("explore");
  });

  it("gives two different new members two different dials", () => {
    // The whole point: before this, these two were indistinguishable.
    const a = deriveAdventurousness({ event_count: 3 }, { adventurousness: 0.1 });
    const b = deriveAdventurousness({ event_count: 3 }, { adventurousness: 0.95 });
    expect(a.posture).not.toBe(b.posture);
    expect(a.guidance).not.toBe(b.guidance);
  });

  it("carries guidance matching the seeded posture, not a fixed explore line", () => {
    const dial = deriveAdventurousness(
      { event_count: 1 },
      { adventurousness: 0.1 },
    );
    expect(dial.guidance).toContain("clear, narrow taste");
  });

  it("ignores the prior once behaviour is established", () => {
    // Observed behaviour outranks what they said at signup.
    const dial = deriveAdventurousness(
      {
        event_count: 40,
        top_vibes: [
          { tag: "quiet", score: 30 },
          { tag: "old-school", score: 3 },
        ],
        top_areas: ["GK"],
      },
      { adventurousness: 0.95 },
    );
    expect(dial.posture).toBe("exploit");
  });

  it("falls back to the default when there is no usable quiz answer", () => {
    for (const prior of [
      undefined,
      null,
      {},
      { adventurousness: Number.NaN },
    ]) {
      const dial = deriveAdventurousness({ event_count: 2 }, prior);
      expect(dial.score).toBe(0.65);
      expect(dial.posture).toBe("explore");
    }
  });

  it("clamps a prior that escaped the 0-1 axis", () => {
    expect(
      deriveAdventurousness({ event_count: 0 }, { adventurousness: 4 }).score,
    ).toBe(1);
    expect(
      deriveAdventurousness({ event_count: 0 }, { adventurousness: -2 }).score,
    ).toBe(0);
  });
});
