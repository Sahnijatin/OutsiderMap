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
