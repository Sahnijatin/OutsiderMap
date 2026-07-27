import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getQuestDetail } from "@/lib/quests/machine";
import { signQuestMediaUrls } from "@/lib/media/quest";

/** GET /api/quests/:id - full quest detail with ordered stops. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`quests:${ctx.user.id}`, 60, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const quest = await getQuestDetail(ctx.supabase, id, (paths) =>
    signQuestMediaUrls(createAdminClient(), paths),
  );
  if (!quest) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(quest);
}

/**
 * DELETE /api/quests/:id - back out of a quest.
 *
 * One user intent ("get rid of this"), two outcomes, because the schema draws
 * the line for us:
 *   draft / abandoned -> deleted outright (RLS: "owner can delete unfinished")
 *   active            -> abandoned (the protect_quest_columns trigger allows
 *                        exactly draft|active -> abandoned), since a run in
 *                        progress can't be deleted
 *   completed         -> refused; a finished quest is a record, and its media
 *                        hangs off it
 * The response says which happened so the UI can word itself honestly.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`quests:${ctx.user.id}`, 60, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // RLS scopes this read to the owner, so a miss is a genuine 404 for them.
  const { data: quest } = await ctx.supabase
    .from("quests")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!quest) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (quest.status === "completed") {
    return NextResponse.json(
      { error: "A finished quest stays finished. That one's yours to keep." },
      { status: 409 },
    );
  }

  if (quest.status === "active") {
    const { error } = await ctx.supabase
      .from("quests")
      .update({ status: "abandoned" })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ outcome: "abandoned" });
  }

  const { error } = await ctx.supabase.from("quests").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ outcome: "deleted" });
}
