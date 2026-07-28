import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

import { normalizeSubmission, SubmissionSchema } from "@/lib/ingest/submit";

describe("SubmissionSchema", () => {
  it("accepts a link alone, a name alone, or both with a comment", () => {
    expect(SubmissionSchema.safeParse({ link: "https://maps.app.goo.gl/x" }).success).toBe(true);
    expect(SubmissionSchema.safeParse({ name: "Roshan Di Kulfi" }).success).toBe(true);
    expect(
      SubmissionSchema.safeParse({
        name: "Roshan Di Kulfi",
        comment: "The rabri faluda, ask for extra kulfi",
      }).success,
    ).toBe(true);
  });

  it("rejects an empty submission - a link or a name is the one requirement", () => {
    expect(SubmissionSchema.safeParse({}).success).toBe(false);
    expect(SubmissionSchema.safeParse({ comment: "great place" }).success).toBe(false);
    expect(SubmissionSchema.safeParse({ link: "", name: "" }).success).toBe(false);
  });

  it("rejects junk links", () => {
    expect(SubmissionSchema.safeParse({ link: "not a url" }).success).toBe(false);
  });
});

describe("normalizeSubmission", () => {
  it("routes a maps link to the maps source with the member context seeded", () => {
    const sub = SubmissionSchema.parse({
      link: "https://maps.app.goo.gl/AbC123",
      comment: "best chhole bhature in the lane",
    });
    const out = normalizeSubmission(sub, { id: "id-1", city: "delhi" });
    expect(out.url).toBe("https://maps.app.goo.gl/AbC123");
    expect(out.sourceType).toBe("maps");
    expect(out.seed).toMatchObject({
      member_submission: true,
      member_comment: "best chhole bhature in the lane",
      member_city: "delhi",
    });
  });

  it("routes an instagram link through the existing social pipeline", () => {
    const sub = SubmissionSchema.parse({ link: "https://www.instagram.com/reel/abc/" });
    expect(normalizeSubmission(sub, { id: "id-2" }).sourceType).toBe("instagram");
  });

  it("gives a name-only submission a member:// pseudo URL", () => {
    const sub = SubmissionSchema.parse({ name: "Roshan Di Kulfi" });
    const out = normalizeSubmission(sub, { id: "id-3", city: "delhi" });
    expect(out.url).toBe("member://submission/id-3");
    expect(out.sourceType).toBe("member");
    expect(out.seed).toMatchObject({
      member_submission: true,
      member_name: "Roshan Di Kulfi",
    });
  });
});
