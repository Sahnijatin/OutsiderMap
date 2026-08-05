import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyDateOfBirth } from "@/lib/consent/age";
import { recordConsents } from "@/lib/consent/record";
import { withdrawablePurposes, type ConsentPurpose } from "@/lib/consent/purposes";

/**
 * The mobile twin of the /setup notice step.
 *
 * Without this the age gate would be web-only, and a native client could walk
 * straight past it into the quiz - which is exactly the bypass §9 is about.
 * POST /api/onboarding refuses until this has been called.
 */

const BodySchema = z.object({
  dateOfBirth: z.string().min(1),
  purposes: z.record(z.string(), z.boolean()).default({}),
});

export async function POST(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Low ceiling on purpose: the RPC is one-shot, so a caller making more than
  // a handful of attempts is probing for a date that gets them in.
  const allowed = await checkRateLimit(`account-age:${ctx.user.id}`, 5, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const verdict = verifyDateOfBirth(parsed.data.dateOfBirth, Date.now());
  if (!verdict.ok && verdict.reason !== "underage") {
    return NextResponse.json({ error: verdict.reason }, { status: 400 });
  }

  // The server recomputes the age regardless of what the client concluded.
  const { data, error } = await ctx.supabase.rpc("set_date_of_birth", {
    p_dob: parsed.data.dateOfBirth,
  });
  if (error) {
    const status = error.message.includes("already recorded") ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  const outcome = Array.isArray(data) ? data[0] : data;
  if (!outcome?.adult) {
    // No consent rows are written for a refused account: recording consent for
    // a minor and then blocking them would leave us holding the very thing the
    // block exists to avoid.
    return NextResponse.json({ ok: false, blocked: true }, { status: 403 });
  }

  // essential LAST: it is what stamps policy_version_accepted and clears the
  // gate, so a partial failure must leave the gate closed rather than let the
  // member through with their optional choices unrecorded. Mirrors
  // acceptNotice in src/app/setup/actions.ts.
  const entries: Array<{ purpose: ConsentPurpose; granted: boolean }> = [
    ...withdrawablePurposes().map((spec) => ({
      purpose: spec.purpose,
      granted: parsed.data.purposes[spec.purpose] === true,
    })),
    { purpose: "essential", granted: true },
  ];

  const { errors } = await recordConsents(ctx.supabase, entries, "api", {
    route: "POST /api/account/age",
  });
  if (errors.length > 0) {
    return NextResponse.json(
      { error: "consent incomplete", details: errors },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, adult: true });
}
