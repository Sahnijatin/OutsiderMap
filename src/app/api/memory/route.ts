import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * "Forget that."
 *
 * The concierge now remembers durable facts a member states about themselves,
 * which is only defensible if the member can see the list and strike anything
 * off it. That is the whole surface: no edit, no add. A row is a record of what
 * the system believes, and one the subject can rewrite in place is evidence of
 * nothing - but a record they cannot delete is a different problem entirely.
 *
 * RLS does the authorization (`member_memory: owner can delete`); this route
 * exists to give the client something to call.
 */
const DeleteSchema = z.object({ id: z.string().uuid() });

export async function DELETE(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`memory:${ctx.user.id}`, 60, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = DeleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // The user_id filter is redundant with the policy and kept anyway: a policy
  // is one migration away from being loosened by accident, and this is the kind
  // of table where that mistake would be silent.
  const { error } = await ctx.supabase
    .from("member_memory")
    .delete()
    .eq("id", parsed.data.id)
    .eq("user_id", ctx.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
