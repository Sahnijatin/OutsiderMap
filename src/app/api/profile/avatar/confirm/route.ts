import { NextResponse, type NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  AvatarConfirmSchema,
  avatarPrefix,
  avatarPublicUrl,
  pruneOldAvatars,
  verifyAvatarObject,
} from "@/lib/media/avatar";

/**
 * POST - the upload landed; point the profile at it.
 *
 * The ownership check runs before anything touches Storage: a path is only
 * trustworthy because this server issued it, so a caller handing back someone
 * else's path must be refused rather than verified. The profile write itself
 * goes through the caller's own client, so RLS remains the last word.
 */
export async function POST(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Its own key: sharing one with the issue route would halve the real ceiling,
  // since every upload spends one of each.
  const allowed = await checkRateLimit(`avatar-confirm:${ctx.user.id}`, 20, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = AvatarConfirmSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const { path } = parsed.data;

  if (!path.startsWith(avatarPrefix(ctx.user.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  let object: { size: number } | null;
  try {
    object = await verifyAvatarObject(admin, path);
  } catch (e) {
    return NextResponse.json(
      { error: "too_large", message: (e as Error).message },
      { status: 400 },
    );
  }
  if (!object) {
    return NextResponse.json({ error: "missing_object" }, { status: 400 });
  }

  // Fail rather than persist a relative URL: avatar_url is read all over the
  // app, and a broken value written once outlives the misconfiguration.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }
  const url = avatarPublicUrl(supabaseUrl, path);
  const { error } = await ctx.supabase
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", ctx.user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The photo is the substantive half of the identity screen; the name can be
  // saved separately and still marks the same step.
  await ctx.supabase.rpc("mark_setup_step", { step: "identity" });

  // Best-effort: a leftover object costs bytes, not correctness.
  await pruneOldAvatars(admin, ctx.user.id, path).catch(() => {});

  return NextResponse.json({ ok: true, avatarUrl: url });
}
