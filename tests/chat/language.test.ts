import { describe, expect, it } from "vitest";
import { detectRegister } from "@/lib/chat/language";

describe("detectRegister", () => {
  it("detects Hinglish in Roman script (survey eval phrasing)", () => {
    const r = detectRegister("200 mie dinner krna hai");
    expect(r.register).toBe("hinglish");
    expect(r.script).toBe("latin");
    expect(r.replyHint).toContain("Hinglish");
  });

  it("detects Hinglish from common tokens", () => {
    expect(detectRegister("yaar koi acha cafe batao").register).toBe("hinglish");
  });

  it("leaves plain English alone (no hint)", () => {
    const r = detectRegister("quiet place to read for a few hours");
    expect(r.register).toBe("english");
    expect(r.replyHint).toBe("");
  });

  it("detects Hindi in Devanagari", () => {
    const r = detectRegister("मुझे कुछ अच्छा खाना है");
    expect(r.register).toBe("hindi");
    expect(r.script).toBe("devanagari");
    expect(r.replyHint).toContain("Hindi");
  });

  it("treats code-mixed Devanagari + Latin as Hinglish", () => {
    const r = detectRegister("koi अच्छा cafe?");
    expect(r.register).toBe("hinglish");
    expect(r.script).toBe("mixed");
  });

  it("is defensive about empty / symbol-only input", () => {
    expect(detectRegister("").register).toBe("other");
    expect(detectRegister("!!!").register).toBe("other");
  });
});
