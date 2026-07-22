import { NextResponse, type NextRequest } from "next/server";
import { getApiContext, type ApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { publicMediaUrl } from "@/lib/media/url";
import { POST_MEDIA_BUCKET } from "@/lib/media/post";
import {
  FEED_PAGE_SIZE,
  FeedQuerySchema,
  rankDiscover,
  type PostAuthor,
  type PostCard,
} from "@/lib/feed/read";

/**
 * GET /api/feed?tab=home|discover&cursor=<iso> — the social feed.
 *  - home: reverse-chronological posts from people you follow + friends (+ you)
 *  - discover: public approved posts, re-ranked by a light Discover score
 * Visibility is enforced by RLS (can_view_post); the tab filters narrow which
 * approved posts are candidates. Keyset-paginated by created_at.
 */

const CARD_FIELDS =
  "id, author_id, type, place_id, area, city, action, mood, body, visibility, status, like_count, comment_count, want_count, created_at, place:places(id, slug, name, area)";

/** followees + accepted-friend counterparts + self - the "home" author set. */
async function networkAuthorIds(ctx: ApiContext): Promise<string[]> {
  const [{ data: follows }, { data: friends }] = await Promise.all([
    ctx.supabase.from("follows").select("followee").eq("follower", ctx.user.id),
    ctx.supabase
      .from("friendships")
      .select("requester, addressee")
      .eq("status", "accepted"),
  ]);
  const ids = new Set<string>([ctx.user.id]);
  for (const f of follows ?? []) ids.add(f.followee);
  for (const fr of friends ?? []) {
    ids.add(fr.requester === ctx.user.id ? fr.addressee : fr.requester);
  }
  return [...ids];
}

export async function GET(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`feed:${ctx.user.id}`, 120, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = FeedQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const { tab, cursor } = parsed.data;

  const network = new Set(await networkAuthorIds(ctx));

  let query = ctx.supabase
    .from("posts")
    .select(CARD_FIELDS)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(FEED_PAGE_SIZE + 1);
  if (tab === "home") {
    query = query.in("author_id", [...network]);
  } else {
    query = query.eq("visibility", "public");
  }
  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const hasMore = (rows?.length ?? 0) > FEED_PAGE_SIZE;
  const page = (rows ?? []).slice(0, FEED_PAGE_SIZE);
  // Cursor is derived from DB order (oldest in the page), before any Discover
  // re-ordering, so pagination stays correct regardless of display order.
  const nextCursor =
    hasMore && page.length > 0 ? page[page.length - 1].created_at : null;

  if (page.length === 0) {
    return NextResponse.json({ tab, posts: [], nextCursor: null });
  }

  // Author identities + first media, both batched for the page.
  const authorIds = [...new Set(page.map((p) => p.author_id))];
  const postIds = page.map((p) => p.id);
  const [{ data: authors }, { data: media }] = await Promise.all([
    ctx.supabase.rpc("public_authors", { ids: authorIds }),
    ctx.supabase
      .from("post_media")
      .select("post_id, kind, path, poster_path, ordinal")
      .in("post_id", postIds)
      .order("ordinal"),
  ]);

  const authorById = new Map<string, PostAuthor>(
    (authors ?? []).map((a) => [a.id, a]),
  );
  const mediaByPost = new Map<string, PostCard["media"]>();
  for (const m of media ?? []) {
    const list = mediaByPost.get(m.post_id) ?? [];
    list.push({
      kind: m.kind,
      url: publicMediaUrl(POST_MEDIA_BUCKET, m.path),
      posterUrl: publicMediaUrl(POST_MEDIA_BUCKET, m.poster_path),
    });
    mediaByPost.set(m.post_id, list);
  }

  const cards: PostCard[] = page.map((p) => ({
    id: p.id,
    author_id: p.author_id,
    type: p.type,
    place: p.place ?? null,
    area: p.area,
    city: p.city,
    action: p.action,
    mood: p.mood,
    body: p.body,
    visibility: p.visibility,
    created_at: p.created_at,
    like_count: p.like_count,
    comment_count: p.comment_count,
    want_count: p.want_count,
    author: authorById.get(p.author_id) ?? null,
    media: mediaByPost.get(p.id) ?? [],
    fromNetwork: network.has(p.author_id),
  }));

  const posts = tab === "discover" ? rankDiscover(cards, Date.now()) : cards;

  return NextResponse.json({ tab, posts, nextCursor });
}
