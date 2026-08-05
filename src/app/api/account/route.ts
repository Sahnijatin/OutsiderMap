import { NextResponse, type NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { eraseSubject } from "@/lib/account/erase";

/**
 * DPDP right to delete: purges all personal data for the authenticated user.
 *
 * Authenticates the caller (bearer or cookie) like every other /api route,
 * then hands off to eraseSubject, which walks the shared registry in
 * lib/account/personal-data.ts - storage objects first, then every table
 * marked for explicit deletion, then the profile row and its cascades, then
 * the auth user, then the erasure record.
 *
 * The table list used to live here, inline, and had drifted about twenty
 * tables behind the schema; post-media and experience-media objects were
 * orphaned on every deletion because the rows that pointed at them cascaded
 * away first. The registry fixes both and a test now fails the build if a new
 * user-keyed table is left unclassified.
 *
 * Best-effort but honest, unchanged: every step runs even if an earlier one
 * fails, and the response reports failures so the client never shows "deleted"
 * on a partial purge.
 */
export async function DELETE(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Throttle this destructive, service-role, cascade-heavy purge. A legitimate
  // caller deletes their account at most a handful of times; anything above
  // that is abuse or a retry storm hammering the admin cascade.
  const allowed = await checkRateLimit(
    `account-delete:${ctx.user.id}`,
    3,
    3600,
  );
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { errors } = await eraseSubject(createAdminClient(), {
    userId: ctx.user.id,
    email: ctx.user.email ?? null,
  });

  if (errors.length > 0) {
    return NextResponse.json(
      { error: "purge incomplete", details: errors },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
