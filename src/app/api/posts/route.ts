import { NextResponse, type NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { CreatePostSchema } from "@/lib/feed/compose";
import { moderatePost } from "@/lib/moderation/gate";

/**
 * POST /api/posts — create a post. It lands `status='pending'` (the RLS
 * with-check forbids any other initial status) and only reaches public
 * visibility once moderation approves it. Media is attached afterward via
 * /api/posts/[id]/media once the row (and its id) exists.
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

  const parsed = CreatePostSchema.safeParse(
    await request.json().catch(() => null),
  );
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
    .select("id, status, type, visibility, created_at")
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
    .select("id, status, type, visibility, created_at")
    .eq("id", data.id)
    .maybeSingle();

  return NextResponse.json({ ok: true, post: gated ?? data }, { status: 201 });
}
