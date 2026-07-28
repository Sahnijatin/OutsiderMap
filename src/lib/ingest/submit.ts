import "server-only";
import { z } from "zod";
import { detectSourceType } from "@/lib/ingest/pipeline";
import type { Json } from "@/types/database";

/**
 * Street submissions - the whole point is zero friction: a Google Maps link
 * OR just a name, plus an optional comment. This normalizes that into an
 * ingest_items row (url, source_type, seeded raw_metadata) so the existing
 * pipeline - extraction, dedupe, admin review - does the heavy lifting.
 */

export const SubmissionSchema = z
  .object({
    link: z.string().trim().url().max(600).optional().or(z.literal("").transform(() => undefined)),
    name: z.string().trim().min(2).max(120).optional().or(z.literal("").transform(() => undefined)),
    comment: z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
  })
  .refine((v) => v.link || v.name, {
    message: "Give a link or a name - either works.",
  });
export type Submission = z.infer<typeof SubmissionSchema>;

/**
 * @param sub validated submission
 * @param opts.id unique id for name-only pseudo URLs (injectable for tests)
 * @param opts.city submitter's home city slug, best-effort context
 */
export function normalizeSubmission(
  sub: Submission,
  opts: { id: string; city?: string | null },
): {
  url: string;
  sourceType: ReturnType<typeof detectSourceType>;
  seed: Record<string, Json>;
} {
  const seed: Record<string, Json> = {
    member_submission: true,
    ...(sub.name ? { member_name: sub.name } : {}),
    ...(sub.comment ? { member_comment: sub.comment } : {}),
    ...(opts.city ? { member_city: opts.city } : {}),
  };
  if (sub.link) {
    return { url: sub.link, sourceType: detectSourceType(sub.link), seed };
  }
  // Name-only: a pseudo URL keeps the unique-url invariant without faking a
  // real address; the pipeline knows not to fetch member:// URLs.
  return {
    url: `member://submission/${opts.id}`,
    sourceType: "member" as const,
    seed,
  };
}
