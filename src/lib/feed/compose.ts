import { z } from "zod";
import {
  DEFAULT_LOCATION_PRECISION,
  LOCATION_PRECISIONS,
  POST_TYPES,
  POST_VISIBILITIES,
} from "./model";

/**
 * Composer input contracts + media limits, shared by the /api/posts routes
 * and the composer UI. Pure (schemas + a small ext check), so it unit-tests
 * cleanly and the client and server validate identically.
 */

export const MAX_POST_BODY = 4000;
export const MAX_POST_MEDIA = 10;
export const MAX_POST_MEDIA_BYTES = 150 * 1024 * 1024; // 150MB per file

const IMAGE_EXTS = ["jpg", "png", "webp"] as const;
const VIDEO_EXTS = ["mp4", "webm", "mov"] as const;

export type PostMediaKind = "image" | "video";

export function allowedPostMediaExt(kind: PostMediaKind, ext: string): boolean {
  return kind === "image"
    ? (IMAGE_EXTS as readonly string[]).includes(ext)
    : (VIDEO_EXTS as readonly string[]).includes(ext);
}

const optionalText = (max: number) =>
  z.string().trim().min(1).max(max).nullable().optional();

/**
 * Create payload. Place-first: a post needs a place, a note, or an action -
 * an entirely empty post is rejected. `status` is never accepted from the
 * client; the row is forced to `pending` server-side.
 */
export const CreatePostSchema = z
  .object({
    type: z.enum(POST_TYPES),
    place_id: z.string().uuid().nullable().optional(),
    area: optionalText(120),
    city: z.string().trim().min(1).max(60).optional(),
    action: optionalText(60),
    mood: optionalText(60),
    body: optionalText(MAX_POST_BODY),
    visibility: z.enum(POST_VISIBILITIES).default("public"),
    location_precision: z.enum(LOCATION_PRECISIONS).default(DEFAULT_LOCATION_PRECISION),
  })
  .refine((v) => Boolean(v.place_id || v.body || v.action), {
    message: "A post needs a place, a note, or an action.",
  });

export type CreatePostInput = z.infer<typeof CreatePostSchema>;

/** Edit payload: any subset of the author-editable fields, but not empty. */
export const PostPatchSchema = z
  .object({
    place_id: z.string().uuid().nullable().optional(),
    area: z.string().trim().max(120).nullable().optional(),
    action: z.string().trim().max(60).nullable().optional(),
    mood: z.string().trim().max(60).nullable().optional(),
    body: z.string().trim().max(MAX_POST_BODY).nullable().optional(),
    visibility: z.enum(POST_VISIBILITIES).optional(),
    location_precision: z.enum(LOCATION_PRECISIONS).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

/** Ask for a signed upload URL for one file. */
export const MediaIssueSchema = z.object({
  kind: z.enum(["image", "video"]),
  ext: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]{2,5}$/),
  size: z.number().int().positive(),
});

/** Confirm a landed upload and record it against the post. */
export const MediaConfirmSchema = z.object({
  path: z.string().min(1).max(300),
  kind: z.enum(["image", "video"]),
  posterPath: z.string().min(1).max(300).optional(),
});
