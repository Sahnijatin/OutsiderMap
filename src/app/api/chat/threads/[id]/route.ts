import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";

/** GET /api/chat/threads/:id - one thread with its messages, oldest first. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`chat-thread:${ctx.user.id}`, 60, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // RLS scopes to the owner, so someone else's thread reads as absent.
  const { data: thread, error } = await ctx.supabase
    .from("chat_threads")
    .select("id, title, city, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!thread) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // A failed select must be an error, not an empty conversation: swallowing
  // it here once made every thread open blank (schema drift - the deploy
  // pipeline was down and this query referenced a column prod didn't have
  // yet) while looking exactly like "my messages were never saved".
  const { data: messages, error: messagesError } = await ctx.supabase
    .from("chat_messages")
    .select("id, role, content, picks, degraded, created_at")
    .eq("thread_id", id)
    .order("created_at", { ascending: true })
    .limit(200);
  if (messagesError) {
    console.error(
      "[chat] thread messages load failed",
      JSON.stringify({ threadId: id, message: messagesError.message }),
    );
    return NextResponse.json({ error: messagesError.message }, { status: 500 });
  }

  return NextResponse.json({ thread, messages: messages ?? [] });
}

/** DELETE /api/chat/threads/:id - remove a thread; the FK cascades messages. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`chat-thread:${ctx.user.id}`, 60, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const { error } = await ctx.supabase
    .from("chat_threads")
    .delete()
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
