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
