import { NextResponse, type NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * GET /api/chat/threads — recent threads; ?latest=1 also returns the newest
 * thread's messages so the chat surface restores in one request.
 */
export async function GET(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`chat-threads:${ctx.user.id}`, 60, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { data: threads, error } = await ctx.supabase
    .from("chat_threads")
    .select("id, title, city, updated_at")
    .order("updated_at", { ascending: false })
    .limit(10);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const wantLatest =
    new URL(request.url).searchParams.get("latest") === "1";
  if (!wantLatest || !threads?.length) {
    return NextResponse.json({ threads: threads ?? [], messages: [] });
  }

  const { data: messages } = await ctx.supabase
    .from("chat_messages")
    .select("id, role, content, picks, created_at")
    .eq("thread_id", threads[0].id)
    .order("created_at", { ascending: true })
    .limit(60);

  return NextResponse.json({ threads, messages: messages ?? [] });
}
