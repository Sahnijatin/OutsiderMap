import { describe, expect, it } from "vitest";
import { QuestBriefSchema } from "@/lib/quests/generate";

describe("QuestBriefSchema city", () => {
  it("accepts and lowercases an explicit city slug", () => {
    const parsed = QuestBriefSchema.parse({ city: " Delhi " });
    expect(parsed.city).toBe("delhi");
  });

  it("rejects slugs over 40 chars", () => {
    const result = QuestBriefSchema.safeParse({ city: "x".repeat(41) });
    expect(result.success).toBe(false);
  });

  it("keeps defaults intact when city is absent", () => {
    const parsed = QuestBriefSchema.parse({});
    expect(parsed.city).toBeUndefined();
    expect(parsed.first_time).toBe(false);
    expect(parsed.interests).toEqual([]);
    expect(parsed.hours).toBe(5);
  });

  it("still validates the rest of the brief alongside a city", () => {
    const parsed = QuestBriefSchema.parse({
      city: "delhi",
      first_time: true,
      interests: ["food", "history"],
      hours: 9,
      budget_max: 2,
      brief: "vegetarian sister visiting",
    });
    expect(parsed).toMatchObject({
      city: "delhi",
      first_time: true,
      hours: 9,
      budget_max: 2,
    });
  });
});
