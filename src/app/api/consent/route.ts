import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadConsents, recordConsent } from "@/lib/consent/record";
import { PRIVACY_POLICY_VERSION, needsReconsent } from "@/lib/consent/policy";
import {
  CONSENT_PURPOSE_KEYS,
  PURPOSES,
  purgeTargets,
} from "@/lib/consent/purposes";
import { purgeDerivedData } from "@/lib/consent/withdraw";

/**
 * Per-purpose consent: read the current state, grant or withdraw one purpose.
 *
 * DPDP §6(6) requires withdrawal to be as easy as giving, which the single
 * personalization toggle was not - it was one boolean covering several
 * distinct purposes, with no record of the act and no consequence beyond a
 * read-path gate.
 */

const PatchSchema = z.object({
  purpose: z.enum(CONSENT_PURPOSE_KEYS),
  granted: z.boolean(),
});

export async function GET(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`consent:${ctx.user.id}`, 60, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const [consents, { data: profile }] = await Promise.all([
    loadConsents(ctx.supabase, ctx.user.id),
    ctx.supabase
      .from("profiles")
      .select("policy_version_accepted")
      .eq("id", ctx.user.id)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    policyVersion: PRIVACY_POLICY_VERSION,
    acceptedVersion: profile?.policy_version_accepted ?? null,
    needsReconsent: needsReconsent(profile?.policy_version_accepted),
    consents,
    purposes: PURPOSES,
  });
}

export async function PATCH(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`consent-write:${ctx.user.id}`, 30, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const { purpose, granted } = parsed.data;

  // Recorded through the member's own client: this is a claim about an act
  // they performed, and it should be made by a request they authenticated.
  const { error } = await recordConsent(ctx.supabase, {
    purpose,
    granted,
    method: "settings_toggle",
    source: { route: "PATCH /api/consent" },
  });
  if (error) {
    // The RPC raises on withdrawing 'essential' - that is account deletion,
    // and it has its own route.
    const status = error.includes("essential") ? 400 : 500;
    return NextResponse.json({ error }, { status });
  }

  if (granted) return NextResponse.json({ ok: true });

  // Withdrawal has to cost us something, or it is a preference rather than a
  // withdrawal. Service role required: interaction_events is append-only under
  // RLS, so the member's own client would delete nothing and report success.
  const purge = await purgeDerivedData(
    createAdminClient(),
    ctx.user.id,
    purgeTargets(purpose),
  );

  if (purge.errors.length > 0) {
    // The consent record deliberately stands. Their wish is what matters; a
    // failed delete is ours to finish, and the daily reconciliation step does.
    return NextResponse.json(
      { error: "withdraw incomplete", details: purge.errors },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, purged: purge });
}
