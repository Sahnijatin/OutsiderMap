import { describe, expect, it } from "vitest";
import {
  ANSWER_ACCEPTED,
  ANSWER_SERVED,
  acceptedPayload,
  servedPayload,
} from "@/lib/events/answers";

describe("answer event payloads", () => {
  it("uses stable event-type constants", () => {
    expect(ANSWER_SERVED).toBe("answer_served");
    expect(ANSWER_ACCEPTED).toBe("answer_accepted");
  });

  it("always carries the answer_id and source on serve", () => {
    const p = servedPayload({ answerId: "a1", source: "chat" });
    expect(p).toEqual({ answer_id: "a1", source: "chat" });
  });

  it("includes query and picks only when provided", () => {
    const p = servedPayload({
      answerId: "a2",
      source: "now",
      query: "cheap dinner",
      picks: ["x", "y"],
    });
    expect(p).toEqual({
      answer_id: "a2",
      source: "now",
      query: "cheap dinner",
      picks: ["x", "y"],
    });
  });

  it("omits an empty query rather than storing a blank", () => {
    const p = servedPayload({ answerId: "a3", source: "chat", query: "" });
    expect(p).not.toHaveProperty("query");
  });

  it("keys acceptance to the same answer_id, so serve↔accept join is exact", () => {
    const served = servedPayload({ answerId: "join-me", source: "chat" });
    const accepted = acceptedPayload("join-me");
    expect(accepted).toEqual({ answer_id: "join-me" });
    expect(accepted.answer_id).toBe(served.answer_id);
  });
});
