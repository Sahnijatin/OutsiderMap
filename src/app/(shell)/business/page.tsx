import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Screen } from "@/components/app/screen";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { submitClaim } from "./actions";

export const metadata: Metadata = { title: "Your business" };

/**
 * The business side of the map: claim the place you own or run (the desk
 * verifies), then it carries the owner-verified mark and your uploads count
 * as the owner's. The public place page stays THE page for a business -
 * claiming marks it yours rather than forking a second page.
 */
export default async function BusinessPage({
  searchParams,
}: {
  searchParams: Promise<{ claim?: string }>;
}) {
  const profile = await requireOnboarded();
  const { claim } = await searchParams;
  const supabase = await createClient();

  const [{ data: claims }, claimTarget] = await Promise.all([
    supabase
      .from("place_claims")
      .select("id, status, note, created_at, place:places(slug, name, area)")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false }),
    claim
      ? supabase
          .from("places")
          .select("id, slug, name, area, claimed_by")
          .eq("slug", claim)
          .eq("is_published", true)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const target = claimTarget?.data ?? null;
  const alreadyClaimed = Boolean(target?.claimed_by);
  const alreadyFiled = Boolean(
    target && (claims ?? []).some((c) => c.place?.slug === target.slug),
  );

  return (
    <Screen width="narrow" className="flex flex-col gap-8">
      <PageHeader
        eyebrow="for owners"
        title="Your business on the map."
      />

      {target && (
        <Card className="flex flex-col gap-3">
          <p className="voice">claim this place</p>
          <p className="font-display text-lg italic">
            {target.name}
            {target.area ? <span className="text-ink-dim"> · {target.area}</span> : null}
          </p>
          {alreadyClaimed ? (
            <p className="text-sm text-ink-dim">
              This place is already owner-claimed. If that&rsquo;s wrong, write
              to us and we&rsquo;ll sort it out.
            </p>
          ) : alreadyFiled ? (
            <p className="text-sm text-ink-dim">
              Your claim is in - the desk reviews it and you&rsquo;ll see the
              status below.
            </p>
          ) : (
            <form action={submitClaim} className="flex flex-col gap-3">
              <input type="hidden" name="placeId" value={target.id} />
              <textarea
                name="note"
                required
                rows={3}
                maxLength={400}
                placeholder="Who are you to this place? (owner, manager, family…) Anything that helps us verify."
                className="w-full rounded-card border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-ink-dim focus:border-accent/60"
              />
              <input
                name="contact"
                maxLength={120}
                placeholder="Phone or email we can verify on (optional)"
                className="w-full rounded-card border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-ink-dim focus:border-accent/60"
              />
              <div>
                <Button type="submit" size="sm">Submit claim</Button>
              </div>
            </form>
          )}
        </Card>
      )}

      <section>
        <p className="voice">your claims</p>
        {(claims ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-ink-dim">
            None yet. Find your place on the map and tap
            &ldquo;Own this place?&rdquo; on its page.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {(claims ?? []).map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-3 text-sm"
              >
                <div className="min-w-0">
                  <Link
                    href={`/place/${encodeURIComponent(c.place?.slug ?? "")}`}
                    className="truncate font-medium text-ink hover:underline"
                  >
                    {c.place?.name ?? "A place"}
                  </Link>
                  {c.place?.area && (
                    <span className="ml-1.5 text-xs text-ink-dim">{c.place.area}</span>
                  )}
                </div>
                <span
                  className={
                    c.status === "approved"
                      ? "shrink-0 rounded-full bg-accent/15 px-2.5 py-0.5 text-xs text-accent"
                      : c.status === "rejected"
                        ? "shrink-0 rounded-full bg-danger/10 px-2.5 py-0.5 text-xs text-danger"
                        : "shrink-0 rounded-full bg-raise px-2.5 py-0.5 text-xs text-ink-dim"
                  }
                >
                  {c.status === "approved" ? "owner-verified" : c.status}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-ink-dim">
          Once verified: your place carries the owner mark, and photos you add
          from its page are credited as the owner&rsquo;s.
        </p>
      </section>
    </Screen>
  );
}
