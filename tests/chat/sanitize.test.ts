import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { sanitizeReply } from "@/lib/chat/sanitize";

describe("sanitizeReply", () => {
  it("strips markdown emphasis the plain-text UI would show literally", () => {
    expect(sanitizeReply("Start at **Olive Bar & Kitchen** for pizza")).toBe(
      "Start at Olive Bar & Kitchen for pizza",
    );
    expect(sanitizeReply("__bold__ and *quiet* and `code`")).toBe(
      "bold and quiet and code",
    );
  });

  it("normalizes em and en dashes to the house hyphen style", () => {
    expect(sanitizeReply("minimal ambiance—it's a relaxing way")).toBe(
      "minimal ambiance - it's a relaxing way",
    );
    expect(sanitizeReply("late hours – quiet corners")).toBe(
      "late hours - quiet corners",
    );
  });

  it("removes heading and bullet prefixes but keeps the prose", () => {
    expect(sanitizeReply("## The plan\n- first stop\n* second stop")).toBe(
      "The plan\nfirst stop\nsecond stop",
    );
  });

  it("leaves clean prose untouched", () => {
    const clean =
      "Cafe Lota first - the back room stays quiet till noon. End with kulfi at Roshan's.";
    expect(sanitizeReply(clean)).toBe(clean);
  });

  it("keeps legitimate asterisk math/notation that is not emphasis", () => {
    expect(sanitizeReply("open till 1am (weekends *only)")).toBe(
      "open till 1am (weekends *only)",
    );
  });
});
