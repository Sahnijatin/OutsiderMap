import { z } from "zod";

/**
 * The PATCH /api/profile body.
 *
 * Extracted from the route so it can be unit-tested: the route imports
 * getApiContext, which pulls in `server-only` and the Supabase server client,
 * and the vitest harness runs in a node environment with neither.
 *
 * Every field is optional because this endpoint serves several callers - the
 * settings toggle, the setup screens, and the shipped mobile app, which sends
 * `{personalization_enabled}` alone and must keep working. `.strict()` means a
 * typo is a 400 rather than a silent no-op, and the refine stops an empty body
 * being reported as a successful update.
 */
export const ProfilePatchSchema = z
  .object({
    personalization_enabled: z.boolean().optional(),
    display_name: z.string().trim().min(1).max(60).nullable().optional(),
    home_city: z.string().trim().min(1).max(40).optional(),
    home_area: z.string().trim().min(1).max(80).nullable().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "nothing to update",
  });

export type ProfilePatch = z.infer<typeof ProfilePatchSchema>;
