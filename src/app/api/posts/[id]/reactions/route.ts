import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext, type ApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { ReactionKindSchema } from "@/lib/feed/model";

/**
 * POST /api/posts/[id]/reactions — like or want_to_go a post.
 * DELETE — remove your reaction.
 * The like/comment/want counters are trigger-maintained; the author
 * notification is trigger-driven. want_to_go is the social→intent bridge:
 * it also saves the post's place to the member's bucket and logs the signal.
 */
const idOk = (id: string) => z.string().uuid().safeParse(id).success;
const BodySchema = z.object({ kind: ReactionKindSchema });

/** want_to_go side-effects: save the anchored place + log the intent signal. */
async function bridgeWantToGo(ctx: ApiContext, postId: string) {
  const { data: post } = await ctx.supabase
    .from("posts")
    .select("place_id")
    .eq("id", postId)
    .maybeSingle();
  if (!post?.place_id) return;

  // Idempotent bucket save (owner RLS); a manual save already there is fine.
  await ctx.supabase
    .from("saved_places")
    .upsert(
      { user_id: ctx.user.id, place_id: post.place_id },
      { onConflict: "user_id,place_id", ignoreDuplicates: true },
    );
  // Append-only learning signal. 'save' is the closest existing event type.
  await ctx.supabase.from("interaction_events").insert({
    user_id: ctx.user.id,
    event_type: "save",
    place_id: post.place_id,
    payload: { source: "post_want_to_go", post_id: postId },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`react:${ctx.user.id}`, 120, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id } = await params;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!idOk(id) || !parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const { kind } = parsed.data;

  // RLS insert with-check enforces: user_id = self and the post is visible.
  const { error } = await ctx.supabase
    .from("post_reactions")
    .insert({ post_id: id, user_id: ctx.user.id, kind });
  if (error && error.code !== "23505") {
    // 23505 = already reacted (idempotent). Other errors (e.g. RLS / missing
    // post) surface as a 400 so the client can back its optimistic toggle out.
    return NextResponse.json(
      { error: "not_allowed", message: "Couldn't react to that post." },
      { status: 400 },
    );
  }
  if (kind === "want_to_go") {
    await bridgeWantToGo(ctx, id);
  }

  return NextResponse.json({ ok: true, kind, reacted: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!idOk(id) || !parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const { error } = await ctx.supabase
    .from("post_reactions")
    .delete()
    .eq("post_id", id)
    .eq("user_id", ctx.user.id)
    .eq("kind", parsed.data.kind);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // Un-want intentionally leaves the bucket save in place (the member may have
  // saved it deliberately); un-saving is a separate, explicit action.
  return NextResponse.json({ ok: true, kind: parsed.data.kind, reacted: false });
}
