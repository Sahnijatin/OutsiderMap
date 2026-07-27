import { NextResponse, type NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { FeedQuerySchema } from "@/lib/feed/read";
import { fetchFeedPage, FeedQueryError } from "@/lib/feed/query";

/**
 * GET /api/feed?tab=home|discover&cursor=<iso> - the social feed.
 * The query itself lives in src/lib/feed/query.ts and is shared with the
 * server-rendered /feed page, so this route only does request plumbing:
 * auth (cookies or bearer, for the mobile app), rate limiting, validation.
 */
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

  try {
    const { posts, nextCursor } = await fetchFeedPage(
      ctx.supabase,
      ctx.user.id,
      tab,
      cursor,
    );
    return NextResponse.json({ tab, posts, nextCursor });
  } catch (err) {
    if (err instanceof FeedQueryError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    throw err;
  }
}
