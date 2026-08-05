import { describe, expect, it } from "vitest";
import { ProfilePatchSchema } from "@/lib/profile/patch";

/**
 * PATCH /api/profile's body contract. This endpoint has three callers - the
 * settings toggle, the setup screens, and the shipped native app - so the
 * interesting assertions are about what must keep working, not just what is
 * newly allowed.
 */

describe("back-compat", () => {
  // The version of the app already on people's phones sends exactly this.
  it("still accepts a lone personalization toggle", () => {
    const parsed = ProfilePatchSchema.safeParse({
      personalization_enabled: false,
    });
    expect(parsed.success).toBe(true);
  });
});

describe("the new fields", () => {
  it.each([
    ["display_name", { display_name: "Adi" }],
    ["home_city", { home_city: "delhi" }],
    ["home_area", { home_area: "Saket" }],
  ])("accepts %s on its own", (_label, body) => {
    expect(ProfilePatchSchema.safeParse(body).success).toBe(true);
  });

  it("accepts several at once", () => {
    expect(
      ProfilePatchSchema.safeParse({
        display_name: "Adi",
        home_city: "delhi",
        home_area: "Saket",
      }).success,
    ).toBe(true);
  });

  it("trims the display name", () => {
    const parsed = ProfilePatchSchema.parse({ display_name: "  Adi  " });
    expect(parsed.display_name).toBe("Adi");
  });

  it("allows null to clear a name or an area", () => {
    expect(ProfilePatchSchema.safeParse({ display_name: null }).success).toBe(
      true,
    );
    expect(ProfilePatchSchema.safeParse({ home_area: null }).success).toBe(true);
  });

  it("rejects an empty string, which would be a name nobody chose", () => {
    expect(ProfilePatchSchema.safeParse({ display_name: "" }).success).toBe(
      false,
    );
    expect(ProfilePatchSchema.safeParse({ home_city: "" }).success).toBe(false);
  });

  it("caps the lengths", () => {
    expect(
      ProfilePatchSchema.safeParse({ display_name: "a".repeat(61) }).success,
    ).toBe(false);
    expect(
      ProfilePatchSchema.safeParse({ home_area: "a".repeat(81) }).success,
    ).toBe(false);
  });
});

describe("rejections", () => {
  it("rejects an empty body rather than reporting a no-op as success", () => {
    expect(ProfilePatchSchema.safeParse({}).success).toBe(false);
  });

  it("rejects unknown keys, so a typo is a 400 and not a silent no-op", () => {
    expect(
      ProfilePatchSchema.safeParse({ personalisation_enabled: true }).success,
    ).toBe(false);
    expect(
      ProfilePatchSchema.safeParse({ is_admin: true }).success,
    ).toBe(false);
  });

  it.each([null, undefined, "string", 42, []])(
    "rejects a non-object body (%s)",
    (body) => {
      expect(ProfilePatchSchema.safeParse(body).success).toBe(false);
    },
  );

  it("rejects wrong types", () => {
    expect(
      ProfilePatchSchema.safeParse({ personalization_enabled: "yes" }).success,
    ).toBe(false);
    expect(ProfilePatchSchema.safeParse({ display_name: 5 }).success).toBe(false);
  });
});
