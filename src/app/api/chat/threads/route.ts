import { NextResponse, type NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * GET /api/chat/threads — recent threads, newest first. ?before=<ISO
 * updated_at> pages older history; ?latest=1 also returns the newest
 * thread's messages (the mobile app's one-request restore contract).
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

  const searchParams = new URL(request.url).searchParams;
  const before = searchParams.get("before");
  if (before && Number.isNaN(Date.parse(before))) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  let query = ctx.supabase
    .from("chat_threads")
    .select("id, title, city, updated_at")
    .order("updated_at", { ascending: false })
    .limit(20);
  if (before) query = query.lt("updated_at", before);

  const { data: threads, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const wantLatest = searchParams.get("latest") === "1";
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
