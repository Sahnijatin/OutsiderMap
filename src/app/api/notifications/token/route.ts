import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";

/**
 * Device push-token registration. The app registers its Expo/native push token
 * after the user grants notification permission, and unregisters on sign-out or
 * permission revocation. RLS scopes both to the caller.
 *
 * The sender (deferred) reads these tokens via the service role.
 */

const RegisterSchema = z.object({
  token: z.string().trim().min(1).max(512),
  platform: z.enum(["ios", "android"]),
});

export async function POST(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = RegisterSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const { token, platform } = parsed.data;

  // Upsert by token: a device that re-registers (or changed hands) is re-bound
  // to the current user, and the timestamp is refreshed.
  const { error } = await ctx.supabase.from("device_tokens").upsert(
    {
      token,
      user_id: ctx.user.id,
      platform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "token" },
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

const UnregisterSchema = z.object({
  token: z.string().trim().min(1).max(512),
});

export async function DELETE(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = UnregisterSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // RLS already scopes deletes to the owner; the user_id filter is belt-and-braces.
  const { error } = await ctx.supabase
    .from("device_tokens")
    .delete()
    .eq("token", parsed.data.token)
    .eq("user_id", ctx.user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
