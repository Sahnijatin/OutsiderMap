import { NextResponse, type NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { CreatePostSchema } from "@/lib/feed/compose";
import { CreateArticleSchema, normalizeExtraPlaceIds } from "@/lib/blog/compose";
import {
  articlePlainText,
  articleSlug,
  readingMinutes,
} from "@/lib/blog/blocks";
import { moderatePost } from "@/lib/moderation/gate";

const POST_FIELDS = "id, status, type, visibility, created_at";

/** Short random slug suffix - the unique index is the real collision guard. */
function slugSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * POST /api/posts - create a post. It lands `status='pending'` (the RLS
 * with-check forbids any other initial status) and only reaches public
 * visibility once moderation approves it. Media is attached afterward via
 * /api/posts/[id]/media once the row (and its id) exists.
 *
 * `type: 'article'` is a member blog (migration 0056): same auth, same rate
 * limit, same moderation gate, plus a post_articles child for the long-form
 * body. It branches below rather than living at its own route precisely so it
 * cannot drift away from those three guarantees.
 */
export async function POST(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`post-create:${ctx.user.id}`, 30, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Give it a moment before posting again." },
      { status: 429 },
    );
  }

  const raw = await request.json().catch(() => null);
  if (raw && typeof raw === "object" && (raw as { type?: unknown }).type === "article") {
    return createArticle(ctx, raw);
  }

  const parsed = CreatePostSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad request", message: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const { data, error } = await ctx.supabase
    .from("posts")
    .insert({
      author_id: ctx.user.id,
      type: input.type,
      place_id: input.place_id ?? null,
      area: input.area ?? null,
      ...(input.city ? { city: input.city } : {}),
      action: input.action ?? null,
      mood: input.mood ?? null,
      body: input.body ?? null,
      visibility: input.visibility,
      location_precision: input.location_precision,
      // status defaults to 'pending'; RLS forbids setting anything else.
    })
    .select(POST_FIELDS)
    .single();
  if (error) {
    // 23503: place_id/city references a row that isn't there.
    if (error.code === "23503") {
      return NextResponse.json(
        { error: "bad_reference", message: "That place isn't in the catalog." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Pre-publish moderation gate: screen the text now and set the post's final
  // status (media is re-screened at confirm time). A gate failure must not
  // lose the post - it just stays pending for human review.
  const admin = createAdminClient();
  try {
    await moderatePost(admin, data.id);
  } catch (err) {
    console.error("post moderation gate failed; leaving pending", err);
  }
  const { data: gated } = await ctx.supabase
    .from("posts")
    .select(POST_FIELDS)
    .eq("id", data.id)
    .maybeSingle();

  return NextResponse.json({ ok: true, post: gated ?? data }, { status: 201 });
}

/**
 * Member blog. Three writes in dependency order: the post, its article child,
 * then any extra places. The post is rolled back if a child fails, so an
 * `article` row without a body can never reach a reader.
 */
async function createArticle(
  ctx: Awaited<ReturnType<typeof getApiContext>> & object,
  raw: unknown,
) {
  const parsed = CreateArticleSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad request", message: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const { data: post, error } = await ctx.supabase
    .from("posts")
    .insert({
      author_id: ctx.user.id,
      type: "article",
      place_id: input.place_id,
      ...(input.city ? { city: input.city } : {}),
      // The prose also lives here, flattened: it is the only article text the
      // moderation gate reads (see articlePlainText).
      body: articlePlainText(input.title, input.body),
      visibility: input.visibility,
      show_in_feed: input.show_in_feed,
      // A blog names the place it is about, so there is nothing to coarsen.
      location_precision: "exact",
    })
    .select(POST_FIELDS)
    .single();
  if (error) {
    if (error.code === "23503") {
      return NextResponse.json(
        { error: "bad_reference", message: "That place isn't in the catalog." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rollback = async () => {
    await ctx.supabase.from("posts").delete().eq("id", post.id);
  };

  const { error: articleError } = await ctx.supabase.from("post_articles").insert({
    post_id: post.id,
    title: input.title,
    slug: articleSlug(input.title, slugSuffix()),
    body: input.body,
    reading_minutes: readingMinutes(input.body),
  });
  if (articleError) {
    await rollback();
    // 23505: the slug suffix collided. Vanishingly rare; the client retries.
    if (articleError.code === "23505") {
      return NextResponse.json(
        { error: "slug_taken", message: "Try publishing that again." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: articleError.message }, { status: 500 });
  }

  const extras = normalizeExtraPlaceIds(input.place_id, input.extra_place_ids);
  if (extras.length > 0) {
    const { error: placesError } = await ctx.supabase
      .from("post_article_places")
      .insert(
        extras.map((place_id, index) => ({
          post_id: post.id,
          place_id,
          sort_order: index,
        })),
      );
    if (placesError) {
      await rollback();
      if (placesError.code === "23503") {
        return NextResponse.json(
          { error: "bad_reference", message: "One of those places isn't in the catalog." },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: placesError.message }, { status: 500 });
    }
  }

  const admin = createAdminClient();
  try {
    await moderatePost(admin, post.id);
  } catch (err) {
    console.error("blog moderation gate failed; leaving pending", err);
  }
  const { data: gated } = await ctx.supabase
    .from("posts")
    .select(POST_FIELDS)
    .eq("id", post.id)
    .maybeSingle();

  return NextResponse.json({ ok: true, post: gated ?? post }, { status: 201 });
}
