import { NextResponse, type NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { generateQuest, QuestBriefSchema } from "@/lib/quests/generate";

/** GET /api/quests — the member's quests, newest first. */
export async function GET(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`quests:${ctx.user.id}`, 60, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { data, error } = await ctx.supabase
    .from("quests")
    .select("id, title, city, status, started_at, completed_at, created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ quests: data ?? [] });
}

/** POST /api/quests — generate a new draft quest (LLM path, tight limit). */
export async function POST(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`quest-gen:${ctx.user.id}`, 8, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Enough plotting for now - try again in an hour." },
      { status: 429 },
    );
  }

  const parsed = QuestBriefSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  try {
    const result = await generateQuest(ctx.supabase, ctx.user.id, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    console.error("quest generation failed", err);
    const message =
      err instanceof Error ? err.message : "Quest generation failed.";
    return NextResponse.json({ error: "generation_failed", message }, { status: 500 });
  }
}
