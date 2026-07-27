import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { agentSystem } from "@/lib/chat/prompts";

const BASE = {
  cityName: "Delhi",
  areas: ["GK", "Hauz Khas"],
  timeLabel: "Fri 21:30 IST",
  questionsAsked: 0,
  personalize: true,
};

describe("agentSystem", () => {
  it("requires understanding before building a plan or market run", () => {
    const prompt = agentSystem(BASE);
    expect(prompt).toContain("understand first, plan second");
    expect(prompt).toContain("do NOT build a plan on guesses");
    // ...but never interrogates: one round max, and "just plan it" short-circuits.
    expect(prompt).toContain("Never ask a second round for the same plan");
    expect(prompt).toContain("surprise me");
  });

  it("lists prior recommendations so the model stops repeating itself", () => {
    const prompt = agentSystem({
      ...BASE,
      shownEarlier: ["Cafe Lota", "Spot One"],
    });
    expect(prompt).toContain(
      "Already recommended in this thread: Cafe Lota, Spot One",
    );
    expect(prompt).toContain("already_shown");
  });

  it("omits the repeat roster on a fresh thread but keeps the rule", () => {
    const prompt = agentSystem(BASE);
    expect(prompt).not.toContain("Already recommended in this thread");
    expect(prompt).toContain("No repeats");
  });

  it("asks for best-first ordering weighted by fit + taste + the ask", () => {
    const prompt = agentSystem(BASE);
    expect(prompt).toContain("best-first");
    expect(prompt).toContain("fit score");
    // The ask must outrank the standing taste profile.
    expect(prompt).toContain("the ask itself always outranks general taste");
  });

  it("grounds plan replies in the stops the tool actually returned", () => {
    const prompt = agentSystem(BASE);
    expect(prompt).toContain("only ever describe what was actually built");
    expect(prompt).toContain("name each place in order");
    // The regression this pins: a plan narrated from memory drifted from
    // Khan Market to Greater Kailash between two turns.
    expect(prompt).toContain("never reconstruct a plan from memory");
    expect(prompt).toContain("call get_plan");
    // The app owns the affordance; the model must not talk about ids.
    expect(prompt).toContain("Never mention plan ids");
    expect(prompt).toContain("View plan button");
    // Area must flow into the build, not just the prose.
    expect(prompt).toContain("area to build_plan");
  });

  it("supports region asks and demands honesty when an area can't be applied", () => {
    const prompt = agentSystem(BASE);
    expect(prompt).toContain('region like "south delhi" / "west delhi"');
    expect(prompt).toContain("never echo the asked area over the real one");
    expect(prompt).toContain("A plan labeled with an area its stops aren't in is a lie");
  });

  it("extends no-repeats to plan stops", () => {
    const prompt = agentSystem(BASE);
    expect(prompt).toContain("must not reuse an earlier plan's stops");
  });

  it("asks for encouragement through specifics, not cheerleading", () => {
    const prompt = agentSystem(BASE);
    expect(prompt).toContain("Encourage with specifics, not cheerleading");
    expect(prompt).toContain("At most one exclamation mark");
    expect(prompt).toContain("I've created a plan titled");
  });

  it("bans assistant-ese so replies read human", () => {
    const prompt = agentSystem(BASE);
    for (const banned of ["hidden gem", "Great choice", "travel brochure"]) {
      expect(prompt).toContain(banned);
    }
    expect(prompt).toContain("Don't reuse the same opener");
  });

  it("hard-stops questions at the cap but invites one good one under it", () => {
    expect(agentSystem({ ...BASE, questionsAsked: 2 })).toContain("Do NOT ask another");
    expect(agentSystem({ ...BASE, questionsAsked: 0 })).toContain(
      "One good question beats a wrong guess",
    );
  });
});
