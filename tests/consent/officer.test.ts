import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The grievance officer contact. Its whole job is to degrade gracefully: an
 * unappointed officer must leave /privacy renderable with an honest
 * placeholder, never a crash and never a half-filled contact block.
 *
 * serverEnv() caches, so each case re-imports the module fresh.
 */

async function officerWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value ?? "");
  }
  const { grievanceOfficer } = await import("@/lib/consent/officer");
  return grievanceOfficer();
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("grievanceOfficer", () => {
  it("is null when nobody has been appointed", () => {
    return expect(officerWith({})).resolves.toBeNull();
  });

  it("returns the contact once both name and email are set", async () => {
    await expect(
      officerWith({
        DPDP_GRIEVANCE_OFFICER_NAME: "A. Officer",
        DPDP_GRIEVANCE_OFFICER_EMAIL: "grievances@example.com",
      }),
    ).resolves.toEqual({
      name: "A. Officer",
      email: "grievances@example.com",
      address: null,
    });
  });

  it("carries the address when it is configured", async () => {
    await expect(
      officerWith({
        DPDP_GRIEVANCE_OFFICER_NAME: "A. Officer",
        DPDP_GRIEVANCE_OFFICER_EMAIL: "grievances@example.com",
        DPDP_GRIEVANCE_OFFICER_ADDRESS: "1 Example Road, New Delhi",
      }),
    ).resolves.toMatchObject({ address: "1 Example Road, New Delhi" });
  });

  it("treats a name with no email as unappointed", async () => {
    // Half a contact is worse than none: it names someone unreachable.
    await expect(
      officerWith({ DPDP_GRIEVANCE_OFFICER_NAME: "A. Officer" }),
    ).resolves.toBeNull();
  });

  it("treats an email with no name as unappointed", async () => {
    await expect(
      officerWith({ DPDP_GRIEVANCE_OFFICER_EMAIL: "grievances@example.com" }),
    ).resolves.toBeNull();
  });

  it("treats a blank value as unset", async () => {
    // The Vercel dashboard happily saves an empty string; serverEnv's
    // withoutEmptyValues is what stops that taking down the page.
    await expect(
      officerWith({
        DPDP_GRIEVANCE_OFFICER_NAME: "   ",
        DPDP_GRIEVANCE_OFFICER_EMAIL: "grievances@example.com",
      }),
    ).resolves.toBeNull();
  });
});
