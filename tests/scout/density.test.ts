import { describe, expect, it } from "vitest";
import {
  isThinDensity,
  MIN_VALIDATORS_FOR_QUORUM,
} from "@/lib/scout/density";

describe("isThinDensity", () => {
  it("pins the default threshold to the publish quorum", () => {
    expect(MIN_VALIDATORS_FOR_QUORUM).toBe(2);
  });

  it("flags a city below the quorum as thin", () => {
    // Cold start: no eligible validators yet -> admin fallback territory.
    expect(isThinDensity(0)).toBe(true);
    expect(isThinDensity(1)).toBe(true);
  });

  it("clears a city that can form an independent quorum", () => {
    expect(isThinDensity(2)).toBe(false);
    expect(isThinDensity(5)).toBe(false);
  });

  it("honours a bounty-specific quorum when passed", () => {
    // A bounty needing 3 validators is thin until 3 are eligible.
    expect(isThinDensity(2, 3)).toBe(true);
    expect(isThinDensity(3, 3)).toBe(false);
  });
});
