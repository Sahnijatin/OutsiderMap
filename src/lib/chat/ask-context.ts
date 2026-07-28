import { z } from "zod";

/**
 * What the member is doing when they ask (plan step D).
 *
 * Chat has been the only surface with no idea of this. Its request body was
 * `{ threadId, message }` and everything else was inferred server-side: the
 * city came from `profiles.home_city` regardless of where they were actually
 * looking, and location never entered the picture at all - in a product whose
 * promise is "it's 3am, I'm in GK2, surprise me". Map search already passes the
 * city it is showing; this is the same idea, carried further.
 *
 * ## Location is used, never requested
 *
 * `getDevicePosition` prompts. This deliberately does not go near it. The
 * client sends the last-known position from the existing cache
 * (`lib/map/location.ts`), which is only ever populated after the member has
 * already granted location to the map. Opening chat must never be the thing
 * that triggers a permission prompt, and asking about dinner should not start
 * collecting somebody's coordinates.
 *
 * Consequences worth knowing: the fix is coarse (up to a week stale, from
 * wherever they last opened the map) and frequently absent. Both are the right
 * trade - a coarse "you are roughly in south Delhi" beats a prompt, and absent
 * simply means distance is not mentioned.
 */

/** Delhi NCR sanity box, generous enough for the whole catalogue footprint. */
const LAT_RANGE = { min: -90, max: 90 };
const LNG_RANGE = { min: -180, max: 180 };

export const AskContextSchema = z.object({
  /**
   * City the member is actually looking at, which need not be their home city.
   * Validated against the live city list server-side before it is trusted.
   */
  city: z.string().trim().min(1).max(64).optional(),
  /** Last-known position from the client cache. Never freshly prompted for. */
  lat: z.number().min(LAT_RANGE.min).max(LAT_RANGE.max).optional(),
  lng: z.number().min(LNG_RANGE.min).max(LNG_RANGE.max).optional(),
  /** Catalog slug of the place the ask started from, if it started from one. */
  placeSlug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,120}$/, "not a catalog slug")
    .optional(),
});

export type AskContext = z.infer<typeof AskContextSchema>;

/** Where the member is, when we know. */
export interface Origin {
  lat: number;
  lng: number;
}

/**
 * A usable origin, or null.
 *
 * Both coordinates or neither: a lone latitude is a client bug, and guessing
 * the other half would put a confident wrong distance in front of the model.
 * (0, 0) is rejected as the classic uninitialised-coordinate value - it is in
 * the Gulf of Guinea, so no Delhi member is ever legitimately there.
 */
export function originOf(ctx: AskContext | undefined): Origin | null {
  if (typeof ctx?.lat !== "number" || typeof ctx?.lng !== "number") return null;
  if (ctx.lat === 0 && ctx.lng === 0) return null;
  return { lat: ctx.lat, lng: ctx.lng };
}
