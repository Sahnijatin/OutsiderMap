/**
 * The reel→post mapping, shared by the render-pipeline cutover (#76). A
 * rendered quest reel becomes a `video` post plus one `post_media` row. Pure,
 * so the shape is unit-tested and the same rule the back-fill migration
 * applies in SQL is expressed once here for the live pipeline.
 */

export type ReelPostInput = {
  userId: string;
  placeId: string | null;
  city: string;
  caption: string | null;
};

/** The `posts` insert for a rendered reel. status defaults to 'pending'. */
export function buildReelPost(input: ReelPostInput) {
  return {
    author_id: input.userId,
    type: "video" as const,
    place_id: input.placeId,
    city: input.city,
    body: input.caption,
    visibility: "public" as const,
    location_precision: "exact" as const,
  };
}

/** The `post_media` insert for a rendered reel's video (in the reel-media
 * bucket historically, post-media going forward - the caller passes which). */
export function buildReelPostMedia(input: {
  postId: string;
  videoPath: string;
  posterPath: string | null;
  bucket: "post-media" | "reel-media";
}) {
  return {
    post_id: input.postId,
    kind: "video" as const,
    path: input.videoPath,
    poster_path: input.posterPath,
    ordinal: 0,
    bucket: input.bucket,
  };
}
