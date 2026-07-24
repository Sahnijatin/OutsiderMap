import { describe, expect, it } from "vitest";
import {
  classifyPlace,
  countByName,
  isFranchiseBrand,
  normaliseName,
  REVIEW_OUTLET_COUNT,
} from "@/lib/places/franchise";

describe("normaliseName", () => {
  it("flattens casing, punctuation and apostrophes", () => {
    expect(normaliseName("Domino's Pizza")).toBe("dominos pizza");
    expect(normaliseName("  KARIM'S  ")).toBe("karims");
    expect(normaliseName("Karim’s")).toBe("karims");
  });
});

describe("isFranchiseBrand", () => {
  it("catches the obvious operators however they are written", () => {
    for (const name of [
      "Domino's Pizza",
      "DOMINOS",
      "McDonald's",
      "Starbucks Coffee",
      "Cafe Coffee Day",
      "Barbeque Nation",
      "Haldiram's",
      "Chaayos",
    ]) {
      expect(isFranchiseBrand(name), name).toBe(true);
    }
  });

  it("catches a branded outlet with a location suffix", () => {
    expect(isFranchiseBrand("Social Hauz Khas")).toBe(true);
    expect(isFranchiseBrand("Def Col Social")).toBe(true);
  });

  it("does not fire on a substring collision", () => {
    // "social" is a brand, but this is a different venue - matching must be
    // on whole tokens, not raw substring.
    expect(isFranchiseBrand("Socialite Bar")).toBe(false);
    expect(isFranchiseBrand("Subwoofer Club")).toBe(false);
  });

  it("leaves the institutions alone", () => {
    // The whole point of the franchise-model rule: these have many outlets
    // and are exactly what the map is for.
    for (const name of [
      "Karim's",
      "Kake di Hatti",
      "Moti Mahal",
      "Gali Paranthe Wali",
      "Rajinder Da Dhaba",
    ]) {
      expect(isFranchiseBrand(name), name).toBe(false);
    }
  });
});

describe("classifyPlace", () => {
  it("excludes a known franchise brand", () => {
    expect(classifyPlace({ name: "Domino's Pizza" })).toMatchObject({
      verdict: "chain",
    });
  });

  it("excludes anything that calls itself a franchise", () => {
    const result = classifyPlace({
      name: "Sharma Foods",
      text: "A franchise outlet serving north Indian food.",
    });
    expect(result.verdict).toBe("chain");
  });

  it("keeps an ordinary independent", () => {
    expect(classifyPlace({ name: "Kunzum Cafe" })).toMatchObject({
      verdict: "independent",
    });
  });

  it("does not exclude a multi-outlet family business outright", () => {
    // Six doors, owner-run. Under a count rule this dies; under ours a human
    // gets to say so.
    const result = classifyPlace({ name: "Bengali Sweet House", outletCount: 6 });
    expect(result.verdict).toBe("review");
    expect(result.verdict).not.toBe("chain");
  });

  it("treats a small number of outlets as fine", () => {
    expect(
      classifyPlace({ name: "Bengali Sweet House", outletCount: 2 }).verdict,
    ).toBe("independent");
  });

  it("raises for review exactly at the threshold", () => {
    expect(
      classifyPlace({ name: "Some Place", outletCount: REVIEW_OUTLET_COUNT })
        .verdict,
    ).toBe("review");
    expect(
      classifyPlace({ name: "Some Place", outletCount: REVIEW_OUTLET_COUNT - 1 })
        .verdict,
    ).toBe("independent");
  });

  it("lets a human overrule every heuristic", () => {
    // A person who has actually been there beats the brand list in both
    // directions.
    expect(
      classifyPlace({ name: "Domino's Pizza", humanVerdict: "independent" }),
    ).toMatchObject({ verdict: "independent" });
    expect(
      classifyPlace({ name: "Kunzum Cafe", humanVerdict: "chain" }),
    ).toMatchObject({ verdict: "chain" });
  });

  it("always explains itself", () => {
    for (const input of [
      { name: "Domino's Pizza" },
      { name: "Kunzum Cafe" },
      { name: "Bengali Sweet House", outletCount: 9 },
    ]) {
      expect(classifyPlace(input).reason.length).toBeGreaterThan(0);
    }
  });
});

describe("countByName", () => {
  it("counts outlets across spelling variants", () => {
    const counts = countByName([
      { name: "Domino's Pizza" },
      { name: "Dominos Pizza" },
      { name: "DOMINO'S PIZZA" },
      { name: "Kunzum Cafe" },
    ]);
    expect(counts.get("dominos pizza")).toBe(3);
    expect(counts.get("kunzum cafe")).toBe(1);
  });

  it("ignores blank names", () => {
    expect(countByName([{ name: "   " }]).size).toBe(0);
  });
});
