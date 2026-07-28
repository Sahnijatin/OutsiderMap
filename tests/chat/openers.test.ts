import { describe, expect, it } from "vitest";

import { chatOpeners, GENERIC_OPENERS, type OpenerInput } from "@/lib/chat/openers";

/**
 * The suggestion chips on an empty chat - the first thing a member sees on the
 * surface meant to prove the product knows them, and until now four hardcoded
 * strings identical for everyone.
 */

const MEMBER: OpenerInput = {
  areas: ["Old Delhi", "Paharganj"],
  cuisines: ["kebab", "parathas"],
  savedRecently: ["Karim's", "Cafe Lota"],
  posture: "exploit",
  hourIST: 20,
};

const member = (over: Partial<OpenerInput> = {}): OpenerInput => ({
  ...MEMBER,
  ...over,
});

describe("chatOpeners", () => {
  it("shows the generic four to a member we know nothing about", () => {
    expect(chatOpeners(null)).toEqual([...GENERIC_OPENERS]);
  });

  it("always offers exactly four", () => {
    // Fewer leaves a gap where the product is supposed to be showing off;
    // more turns an invitation into a menu.
    expect(chatOpeners(member())).toHaveLength(4);
    expect(chatOpeners(member({ areas: [], cuisines: [], savedRecently: [] })))
      .toHaveLength(4);
  });

  it("leads with the hour, not with taste", () => {
    // A concierge whose opening offer at 2am is "first date, not trying too
    // hard" has already shown it is not paying attention to anything.
    expect(chatOpeners(member({ hourIST: 2 }))[0]).toBe("it's late and I'm starving");
    expect(chatOpeners(member({ hourIST: 8 }))[0]).toBe("breakfast somewhere good");
    expect(chatOpeners(member({ hourIST: 14 }))[0]).toBe(
      "somewhere to sit for a few hours",
    );
    expect(chatOpeners(member({ hourIST: 20 }))[0]).toBe("dinner tonight, nothing fancy");
  });

  it("covers every hour of the clock", () => {
    // The late-night bucket wraps midnight, which is exactly the kind of range
    // that ends up with a hole in it.
    for (let hour = 0; hour < 24; hour += 1) {
      expect(chatOpeners(member({ hourIST: hour }))[0]).toBeTruthy();
    }
  });

  it("uses the member's own vocabulary", () => {
    const openers = chatOpeners(member());
    expect(openers).toContain("the best kebab you know");
    expect(openers).toContain("somewhere like Karim's");
  });

  it("turns their bucket into a query they did not have to remember", () => {
    // "Somewhere like X" is the most useful thing a member can say and the
    // hardest to think of unprompted - they would have to recall what is in
    // their own saved list first.
    expect(chatOpeners(member({ cuisines: [] }))).toContain(
      "somewhere like Karim's",
    );
  });

  it("offers to surprise only someone whose behaviour says they would take it", () => {
    // To a member with one narrow taste, "surprise me" is not an invitation -
    // it is the app admitting it has no idea.
    expect(chatOpeners(member({ posture: "explore", cuisines: [], savedRecently: [] })))
      .toContain("surprise me");
    expect(chatOpeners(member({ posture: "exploit" }))).not.toContain("surprise me");
    expect(chatOpeners(member({ posture: "balanced" }))).not.toContain("surprise me");
  });

  it("tops up with the generic ones rather than showing a short column", () => {
    const openers = chatOpeners(
      member({ areas: [], cuisines: [], savedRecently: [], hourIST: 20 }),
    );
    expect(openers[0]).toBe("dinner tonight, nothing fancy");
    expect(openers.slice(1).every((o) => GENERIC_OPENERS.includes(o as never))).toBe(true);
  });

  it("never shows the same chip twice", () => {
    // The late-night hour opener IS one of the generic four, so the top-up has
    // to notice. Two identical chips read as a bug, not as emphasis.
    const openers = chatOpeners(
      member({ hourIST: 3, areas: [], cuisines: [], savedRecently: [] }),
    );
    expect(new Set(openers).size).toBe(openers.length);
  });

  it("skips a value too long to read as a noun in a sentence", () => {
    // Neither areas nor cuisines are length-validated anywhere upstream, and
    // one long value produces a chip that wraps to three lines.
    const openers = chatOpeners(
      member({
        cuisines: ["a cuisine description someone typed into the free text box"],
        areas: [],
        savedRecently: [],
      }),
    );
    expect(openers.some((o) => o.length > 60)).toBe(false);
  });

  it("falls through to the next usable value rather than giving up", () => {
    const openers = chatOpeners(
      member({ cuisines: ["  ", "x".repeat(80), "parathas"] }),
    );
    expect(openers).toContain("the best parathas you know");
  });

  it("is deterministic for the same member and hour", () => {
    // Rendered on the server and hydrated on the client: anything that varies
    // between the two is a hydration mismatch, and anything that varies between
    // visits is unsettling rather than fresh.
    expect(chatOpeners(member())).toEqual(chatOpeners(member()));
  });

  it("gives two different members different chips", () => {
    const a = chatOpeners(member());
    const b = chatOpeners(
      member({
        areas: ["Khan Market"],
        cuisines: ["third-wave-coffee"],
        savedRecently: ["Blue Tokai"],
      }),
    );
    expect(a).not.toEqual(b);
  });

  it("phrases every chip as an ask, never as an observation", () => {
    // The recitation rule, applied to the one surface that puts words in the
    // member's mouth. "the best kebab you know" is a shortcut; "since you love
    // kebab" would be the product reading a file out loud.
    for (const chip of chatOpeners(member({ posture: "explore" }))) {
      expect(chip).not.toMatch(/\byou (?:love|like|prefer|usually|always)\b/i);
      expect(chip).not.toMatch(/\b(?:since|because|as) you\b/i);
      expect(chip).not.toMatch(/\byour\b/i);
    }
  });
});
