import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * POST /api/scout/submissions - a scout submits a hidden spot. Creates an
 * unpublished, source='submitted' catalog place attributed to the scout, then
 * spawns a verify bounty so independent members can confirm it exists on-site.
 * The place stays invisible in the catalog until a quorum publishes it (#113).
 *
 * places is admin-write, so the insert uses the service role with submitted_by
 * pinned to the authenticated scout (never client-set).
 */
const BodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  city: z.string().trim().min(1).max(40).default("delhi"),
  area: z.string().trim().max(80).optional(),
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  note: z.string().trim().max(500).optional(),
});

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || "spot"}-${suffix}`;
}

export async function POST(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`scout-submit:${ctx.user.id}`, 20, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const input = parsed.data;

  const admin = createAdminClient();
  const { data: place, error: placeErr } = await admin
    .from("places")
    .insert({
      slug: slugify(input.name),
      name: input.name,
      city: input.city,
      area: input.area ?? null,
      lat: input.lat,
      lng: input.lng,
      editor_note: input.note ?? null,
      source: "submitted",
      is_published: false,
      submitted_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (placeErr || !place) {
    return NextResponse.json(
      { error: placeErr?.message ?? "insert failed" },
      { status: 500 },
    );
  }

  const { data: bountyId, error: bountyErr } = await admin.rpc(
    "spawn_verify_bounty",
    { p_place_id: place.id, p_bounty_points: 20 },
  );
  if (bountyErr) {
    return NextResponse.json({ error: bountyErr.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, place_id: place.id, bounty_id: bountyId },
    { status: 201 },
  );
}
