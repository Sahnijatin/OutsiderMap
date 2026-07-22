import { describe, expect, it } from "vitest";
import {
  extractUrls,
  heuristicScores,
  repetitionRatio,
} from "@/lib/moderation/heuristics";

describe("extractUrls", () => {
  it("pulls http(s) links", () => {
    expect(extractUrls("see https://a.com and http://b.co/x now")).toEqual([
      "https://a.com",
      "http://b.co/x",
    ]);
    expect(extractUrls("no links here")).toEqual([]);
  });
});

describe("repetitionRatio", () => {
  it("is 0 for short or all-unique text and high for repetition", () => {
    expect(repetitionRatio("hi")).toBe(0);
    expect(repetitionRatio("one two three four")).toBe(0);
    expect(repetitionRatio("buy buy buy buy buy buy")).toBeGreaterThan(0.6);
  });
});

describe("heuristicScores", () => {
  it("stays empty for ordinary text", () => {
    expect(heuristicScores("great chai at this rooftop, loved the view")).toEqual({});
  });

  it("flags link flooding as spam", () => {
    expect(
      heuristicScores("check https://a.com https://b.com https://c.com").spam,
    ).toBeGreaterThanOrEqual(0.8);
  });

  it("flags a single link that dominates the text", () => {
    expect(heuristicScores("https://really-long-spam-domain.example/path").spam).toBeGreaterThan(0);
  });

  it("flags heavy repetition and known spam phrases", () => {
    expect(heuristicScores("win win win win win win win").spam).toBeGreaterThan(0);
    expect(heuristicScores("Click here to win a free prize").spam).toBeGreaterThan(0);
  });

  it("honours a custom spam-phrase list", () => {
    expect(heuristicScores("promo code XYZ", ["promo code"]).spam).toBeGreaterThan(0);
  });
});
