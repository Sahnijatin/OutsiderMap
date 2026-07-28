import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { extractStorySignals, mergeKey } from "@/lib/harvest/story";

describe("extractStorySignals", () => {
  it("extracts tagged, quoted evidence from real review prose", () => {
    const signals = extractStorySignals([
      {
        text: "An institution since 1948 - three generations of the same family run the counter. The rabri faluda is their signature dish here.",
        source: "google:review",
      },
    ]);
    const tags = signals.map((s) => s.tag);
    expect(tags).toContain("origin");
    expect(tags).toContain("speciality");
    expect(signals.every((s) => s.source === "google:review")).toBe(true);
  });

  it("dedupes repeated sentences across merged passages", () => {
    const passage = {
      text: "Their margherita is famous for the wood-fired char.",
      source: "google:review",
    };
    const signals = extractStorySignals([passage, passage, passage]);
    expect(signals).toHaveLength(1);
  });
});

describe("mergeKey", () => {
  it("identifies the same physical place across sources and noise words", () => {
    expect(mergeKey("The Cafe Lota", "delhi")).toBe(mergeKey("Cafe Lota", "delhi"));
    expect(mergeKey("Lota Kitchen & House", "delhi")).toBe(mergeKey("Lota", "delhi"));
  });

  it("keeps different cities apart", () => {
    expect(mergeKey("Cafe Lota", "delhi")).not.toBe(mergeKey("Cafe Lota", "gurgaon"));
  });
});
