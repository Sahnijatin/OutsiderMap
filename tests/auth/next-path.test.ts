import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/next-path";

describe("safeNextPath", () => {
  it("keeps a same-origin relative path", () => {
    expect(safeNextPath("/place/hauz-khas")).toBe("/place/hauz-khas");
    expect(safeNextPath("/quests?new=1")).toBe("/quests?new=1");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeNextPath("https://evil.example/phish")).toBe("/map");
    expect(safeNextPath("//evil.example")).toBe("/map");
  });

  it("falls back when empty or missing", () => {
    expect(safeNextPath(null)).toBe("/map");
    expect(safeNextPath(undefined)).toBe("/map");
    expect(safeNextPath("")).toBe("/map");
  });

  it("honours a custom fallback", () => {
    expect(safeNextPath(null, "/feed")).toBe("/feed");
  });
});
