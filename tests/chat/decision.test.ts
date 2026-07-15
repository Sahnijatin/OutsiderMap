import { describe, expect, it } from "vitest";
import {
  ChatDecisionSchema,
  ChatPicksSchema,
  decisionSystem,
} from "@/lib/chat/prompts";

const intent = {
  mood: null,
  craving: "crispy",
  energy: null,
  budget_max: null,
  area: null,
  company: null,
  wants: ["crispy"],
  avoid: [],
};

describe("ChatDecisionSchema", () => {
  it("accepts an ask decision", () => {
    const parsed = ChatDecisionSchema.parse({
      action: "ask",
      question: "Crispy like street-fried, or crispy like a bakery?",
      intent,
      search_query: null,
    });
    expect(parsed.action).toBe("ask");
  });

  it("accepts a recommend decision", () => {
    const parsed = ChatDecisionSchema.parse({
      action: "recommend",
      question: null,
      intent,
      search_query: "crispy late-night street food",
    });
    expect(parsed.search_query).toContain("crispy");
  });

  it("rejects unknown actions", () => {
    expect(() =>
      ChatDecisionSchema.parse({
        action: "chitchat",
        question: null,
        intent,
        search_query: null,
      }),
    ).toThrow();
  });
});

describe("ChatPicksSchema", () => {
  it("caps picks at three", () => {
    expect(() =>
      ChatPicksSchema.parse({
        lead_in: "Here you go.",
        picks: Array.from({ length: 4 }, (_, i) => ({
          slug: `p${i}`,
          reason: "fits",
        })),
      }),
    ).toThrow();
  });
});

describe("decisionSystem", () => {
  it("carries the question budget into the prompt", () => {
    const prompt = decisionSystem({
      cityName: "Delhi",
      areas: ["Hauz Khas"],
      questionsAsked: 2,
      timeLabel: "Fri 23:10 IST",
    });
    expect(prompt).toContain("2 narrowing question(s)");
    expect(prompt).toContain("Hauz Khas");
    expect(prompt).not.toContain("—");
  });
});
