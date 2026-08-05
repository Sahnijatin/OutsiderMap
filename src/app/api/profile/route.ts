import { NextResponse, type NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { normalizeFollowState } from "@/lib/feed/follows";
import { ProfilePatchSchema } from "@/lib/profile/patch";
import type { SetupStepId } from "@/lib/setup/steps";
import type { Database } from "@/types/database";

/**
 * The member's profile screen: the system's read on their taste (the wow
 * moment) plus the personalization consent toggle. RLS scopes both reads and
 * the write to the caller.
 */
export async function GET(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`profile:${ctx.user.id}`, 60, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const [{ data: profile }, { data: taste }, { data: follow }] =
    await Promise.all([
      ctx.supabase
        .from("profiles")
        .select(
          "display_name, avatar_url, home_city, home_area, personalization_enabled, onboarding_completed_at, setup_steps",
        )
        .eq("id", ctx.user.id)
        .maybeSingle(),
      ctx.supabase
        .from("taste_profiles")
        .select("taste_summary, learned_signals, version, updated_at")
        .eq("user_id", ctx.user.id)
        .maybeSingle(),
      ctx.supabase.rpc("follow_state", { target: ctx.user.id }),
    ]);

  return NextResponse.json({
    profile,
    taste,
    follows: normalizeFollowState(follow?.[0]),
  });
}

/**
 * Profile writes: the personalization toggle, plus the two things the setup
 * flow captures (where you live, what you are called). This is also the HTTP
 * twin of those screens, so the native app can capture the same data.
 */
export async function PATCH(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`profile:${ctx.user.id}`, 60, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = ProfilePatchSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const body = parsed.data;

  // Build from present keys only: an absent field must stay untouched, and
  // `null` is a real value here (clearing a name or an area).
  const update: Database["public"]["Tables"]["profiles"]["Update"] = {};
  if ("personalization_enabled" in body) {
    update.personalization_enabled = body.personalization_enabled;
  }
  if ("display_name" in body) update.display_name = body.display_name;

  // home_city is a foreign key to cities(slug) and home_area must be one of
  // that city's known areas. Checking here turns a bad value into a 400
  // instead of letting Postgres raise an FK violation as a 500 - and keeps
  // the free-text area column aligned with the catalog's real area names.
  if ("home_city" in body || "home_area" in body) {
    // An area-only patch is validated against the city the member is already
    // in, so "Saket" can't be attached to a profile that lives elsewhere.
    let citySlug = body.home_city;
    if (!citySlug) {
      const { data: current } = await ctx.supabase
        .from("profiles")
        .select("home_city")
        .eq("id", ctx.user.id)
        .maybeSingle();
      citySlug = current?.home_city ?? undefined;
    }
    if (!citySlug) {
      return NextResponse.json({ error: "unknown city" }, { status: 400 });
    }
    const { data: city } = await ctx.supabase
      .from("cities")
      .select("slug, areas")
      .eq("slug", citySlug)
      .eq("is_live", true)
      .maybeSingle();
    if (!city) {
      return NextResponse.json({ error: "unknown city" }, { status: 400 });
    }
    if ("home_city" in body) update.home_city = city.slug;
    if ("home_area" in body) {
      if (
        body.home_area != null &&
        !city.areas.includes(body.home_area)
      ) {
        return NextResponse.json({ error: "unknown area" }, { status: 400 });
      }
      update.home_area = body.home_area;
    }
  }

  const { error } = await ctx.supabase
    .from("profiles")
    .update(update)
    .eq("id", ctx.user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Record which setup screens this satisfied, so the flow stops asking and
  // the profile nudge retires. Never fatal: the data landed either way.
  const steps: SetupStepId[] = [];
  if ("home_city" in body || "home_area" in body) steps.push("city");
  if ("display_name" in body) steps.push("identity");
  for (const step of steps) {
    await ctx.supabase.rpc("mark_setup_step", { step });
  }

  return NextResponse.json({ ok: true });
}
