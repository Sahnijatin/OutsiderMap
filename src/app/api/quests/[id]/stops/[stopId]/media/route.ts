import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  allowedExt,
  issueQuestUpload,
  MAX_MEDIA_PER_STOP,
  MAX_QUEST_MEDIA_BYTES,
  questMediaPath,
  QUEST_MEDIA_BUCKET,
} from "@/lib/media/quest";

/**
 * POST - issue a signed direct-to-Storage upload URL for the unlocked stop.
 * DELETE - remove one of the member's own captures while the stop is open.
 */
const IssueSchema = z.object({
  kind: z.enum(["image", "video"]),
  ext: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]{2,5}$/),
  size: z.number().int().positive(),
});

async function ownedUnlockedStop(
  ctx: NonNullable<Awaited<ReturnType<typeof getApiContext>>>,
  questId: string,
  stopId: string,
) {
  const { data: stop } = await ctx.supabase
    .from("quest_stops")
    .select("id, status, quest_id, quest:quests(id, user_id, status)")
    .eq("id", stopId)
    .eq("quest_id", questId)
    .maybeSingle();
  if (!stop || stop.quest?.user_id !== ctx.user.id) return null;
  if (stop.status !== "unlocked" || stop.quest.status !== "active") {
    return null;
  }
  return stop;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stopId: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`quest-media:${ctx.user.id}`, 60, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id, stopId } = await params;
  if (
    !z.string().uuid().safeParse(id).success ||
    !z.string().uuid().safeParse(stopId).success
  ) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const parsed = IssueSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const { kind, ext, size } = parsed.data;
  if (!allowedExt(kind, ext)) {
    return NextResponse.json(
      { error: "unsupported", message: "That file type isn't supported." },
      { status: 400 },
    );
  }
  if (size > MAX_QUEST_MEDIA_BYTES) {
    return NextResponse.json(
      { error: "too_large", message: "150MB max per file." },
      { status: 400 },
    );
  }

  const stop = await ownedUnlockedStop(ctx, id, stopId);
  if (!stop) {
    return NextResponse.json(
      { error: "not_current", message: "This stop isn't open for capture." },
      { status: 400 },
    );
  }

  const { count } = await ctx.supabase
    .from("quest_stop_media")
    .select("id", { count: "exact", head: true })
    .eq("stop_id", stopId);
  if ((count ?? 0) >= MAX_MEDIA_PER_STOP) {
    return NextResponse.json(
      { error: "full", message: "That's plenty for one stop." },
      { status: 400 },
    );
  }

  const path = questMediaPath({
    userId: ctx.user.id,
    questId: id,
    stopId,
    ext,
  });
  const admin = createAdminClient();
  const upload = await issueQuestUpload(admin, path);
  return NextResponse.json({ ...upload, bucket: QUEST_MEDIA_BUCKET, kind });
}

const DeleteSchema = z.object({ path: z.string().min(1).max(300) });

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stopId: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id, stopId } = await params;
  const parsed = DeleteSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const stop = await ownedUnlockedStop(ctx, id, stopId);
  if (!stop) {
    return NextResponse.json({ error: "not_current" }, { status: 400 });
  }

  // RLS: row delete only while the stop is unlocked and owned.
  const { data: deleted } = await ctx.supabase
    .from("quest_stop_media")
    .delete()
    .eq("stop_id", stopId)
    .eq("user_id", ctx.user.id)
    .eq("storage_path", parsed.data.path)
    .select("id");
  if (deleted && deleted.length > 0) {
    const admin = createAdminClient();
    await admin.storage.from(QUEST_MEDIA_BUCKET).remove([parsed.data.path]);
  }
  return NextResponse.json({ ok: true });
}
