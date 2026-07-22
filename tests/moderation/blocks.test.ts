import { describe, expect, it } from "vitest";
import { BlockTargetSchema, isSelfBlock } from "@/lib/moderation/blocks";

const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("BlockTargetSchema", () => {
  it("accepts a uuid, rejects otherwise", () => {
    expect(BlockTargetSchema.safeParse(OTHER).success).toBe(true);
    expect(BlockTargetSchema.safeParse("nope").success).toBe(false);
  });
});

describe("isSelfBlock", () => {
  it("is true only for self", () => {
    expect(isSelfBlock(ME, ME)).toBe(true);
    expect(isSelfBlock(ME, OTHER)).toBe(false);
  });
});
