import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { approveClaim, rejectClaim } from "./actions";

export const metadata: Metadata = { title: "Claims · Admin" };

/**
 * Business claims inbox: who says they own what, with their pitch and
 * contact. Approving marks the place owner-verified (places.claimed_by).
 */
export default async function AdminClaimsPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: pending } = await admin
    .from("place_claims")
    .select(
      "id, note, contact, created_at, place:places(slug, name, area), claimant:profiles!place_claims_user_id_fkey(username, display_name, outsider_number)",
    )
    .eq("status", "pending")
    .order("created_at")
    .limit(50);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-2xl italic">
          Business claims ({pending?.length ?? 0})
        </h2>
        <p className="mt-1 max-w-xl text-sm text-ink-dim">
          Owners claiming their places. Verify before approving - a call to
          the venue settles most of these in a minute.
        </p>
      </div>
      {(pending ?? []).length === 0 ? (
        <p className="text-sm text-ink-dim">Inbox zero.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {pending!.map((c) => (
            <Card key={c.id} className="flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between gap-3">
                <Link
                  href={`/place/${encodeURIComponent(c.place?.slug ?? "")}`}
                  className="font-display text-lg italic hover:underline"
                >
                  {c.place?.name ?? "A place"}
                  {c.place?.area ? (
                    <span className="text-sm text-ink-dim"> · {c.place.area}</span>
                  ) : null}
                </Link>
                <span className="shrink-0 text-xs text-ink-dim">
                  {c.claimant?.username
                    ? `@${c.claimant.username}`
                    : (c.claimant?.display_name ?? "member")}
                  {c.claimant?.outsider_number != null
                    ? ` · #${c.claimant.outsider_number}`
                    : ""}
                </span>
              </div>
              <p className="border-l-2 border-accent/60 pl-2 text-sm italic text-ink-dim">
                &ldquo;{c.note}&rdquo;
              </p>
              {c.contact && (
                <p className="font-mono text-xs text-ink-dim">verify via: {c.contact}</p>
              )}
              <div className="mt-1 flex gap-2">
                <form action={approveClaim}>
                  <input type="hidden" name="id" value={c.id} />
                  <Button type="submit" size="sm">Approve → owner-verified</Button>
                </form>
                <form action={rejectClaim}>
                  <input type="hidden" name="id" value={c.id} />
                  <Button type="submit" size="sm" variant="danger">Reject</Button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
