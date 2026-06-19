import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Admin · Waitlist",
};

export default async function WaitlistPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: applicants } = await admin
    .from("waitlist")
    .select(
      "id, first_name, last_name, email, phone, gender, city, instagram, referral_code, referred_by, spot_place_id, status, created_at",
    )
    .order("created_at", { ascending: false });

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl">Waitlist</h1>
        <p className="text-sm text-ink-dim">
          Applicants from the <code className="text-ink">/join</code> campaign
          page. Dropped spots land in Submissions.
        </p>
      </header>

      {(!applicants || applicants.length === 0) && (
        <p className="text-sm text-ink-dim">No applications yet.</p>
      )}

      <ul className="flex flex-col gap-3">
        {(applicants ?? []).map((a) => (
          <li
            key={a.id}
            className="flex flex-col gap-2 rounded-card border border-line bg-surface p-5"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-medium">
                {a.first_name} {a.last_name}
              </span>
              <span className="text-sm text-ink-dim">{a.city}</span>
              <span className="font-mono text-xs text-accent">
                {a.referral_code}
              </span>
              <span className="ml-auto font-mono text-xs text-ink-dim">
                {new Date(a.created_at).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  timeZone: "Asia/Kolkata",
                })}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-dim">
              <a href={`mailto:${a.email}`} className="hover:text-ink">
                {a.email}
              </a>
              <a href={`tel:${a.phone}`} className="hover:text-ink">
                {a.phone}
              </a>
              {a.instagram && (
                <a
                  href={`https://instagram.com/${a.instagram}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-ink"
                >
                  @{a.instagram}
                </a>
              )}
              {a.gender && <span>{a.gender}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              {a.referred_by && (
                <span className="text-ink-dim">
                  Referred by{" "}
                  <span className="font-mono text-ink">{a.referred_by}</span>
                </span>
              )}
              {a.spot_place_id && (
                <Link
                  href={`/admin/places/${a.spot_place_id}`}
                  className="text-accent hover:underline"
                >
                  Review dropped spot →
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
