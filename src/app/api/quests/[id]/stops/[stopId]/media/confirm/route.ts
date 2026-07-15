import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  signQuestMediaUrls,
  verifyQuestObject,
} from "@/lib/media/quest";

/**
 * POST — after the client PUTs to the signed URL, verify the object landed
 * (and fits the cap), then record the quest_stop_media row. Returns the
 * stop's media list with fresh signed display URLs.
 */
const BodySchema = z.object({
  path: z.string().min(1).max(300),
  mediaType: z.enum(["image", "video"]),
  durationSeconds: z.number().positive().max(600).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stopId: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(
    `quest-media-confirm:${ctx.user.id}`,
    60,
    3600,
  );
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id, stopId } = await params;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (
    !parsed.success ||
    !z.string().uuid().safeParse(id).success ||
    !z.string().uuid().safeParse(stopId).success
  ) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const { path, mediaType, durationSeconds } = parsed.data;

  // Paths are server-issued and owner-prefixed; only accept ones that belong
  // to this exact user + quest + stop.
  const expectedPrefix = `q/${ctx.user.id}/${id}/${stopId}/`;
  if (!path.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const admin = createAdminClient();
  let object: { size: number } | null;
  try {
    object = await verifyQuestObject(admin, path);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json({ error: "too_large", message }, { status: 400 });
  }
  if (!object) {
    return NextResponse.json(
      { error: "missing", message: "Upload didn't finish - try again." },
      { status: 400 },
    );
  }

  // RLS enforces: owner, stop currently unlocked.
  const { error: insertError } = await ctx.supabase
    .from("quest_stop_media")
    .insert({
      stop_id: stopId,
      user_id: ctx.user.id,
      storage_path: path,
      media_type: mediaType,
      duration_seconds: durationSeconds ?? null,
    });
  if (insertError) {
    await admin.storage.from("quest-media").remove([path]);
    return NextResponse.json(
      { error: "not_current", message: "This stop isn't open for capture." },
      { status: 400 },
    );
  }

  const { data: media } = await ctx.supabase
    .from("quest_stop_media")
    .select("id, storage_path, media_type, created_at")
    .eq("stop_id", stopId)
    .order("created_at");
  const urls = await signQuestMediaUrls(
    admin,
    (media ?? []).map((m) => m.storage_path),
  );

  return NextResponse.json({
    media: (media ?? []).map((m) => ({
      ...m,
      url: urls.get(m.storage_path) ?? null,
    })),
  });
}
