import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { signVettingUrls } from "@/lib/vetting/media";

export const metadata: Metadata = {
  title: "Admin · Waitlist",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "border-line text-ink-dim",
  accepted: "border-accent/40 bg-accent/10 text-accent",
  rejected: "border-danger/40 bg-danger/10 text-danger",
  waitlisted: "border-line bg-night/40 text-ink",
};

export default async function WaitlistPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: applicants } = await admin
    .from("waitlist")
    .select(
      "id, first_name, last_name, email, phone, gender, city, instagram, referral_code, referred_by, spot_place_id, status, utm_source, utm_campaign, created_at, selfie_path, photo_paths, consent_personal_data, reviewed_at, reviewer_note",
    )
    .order("created_at", { ascending: false });

  // Sign every vetting image up front in one batch (the bucket is private, so
  // images are only viewable through short-lived signed URLs), then look them
  // up per applicant when rendering.
  const allPaths = (applicants ?? []).flatMap((a) =>
    [a.selfie_path, ...(a.photo_paths ?? [])].filter(
      (p): p is string => Boolean(p),
    ),
  );
  const signed = await signVettingUrls(admin, allPaths);
  const urlByPath = new Map(
    signed
      .filter((s) => s.signedUrl)
      .map((s) => [s.path, s.signedUrl as string]),
  );

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
        {(applicants ?? []).map((a) => {
          const selfieUrl = a.selfie_path
            ? urlByPath.get(a.selfie_path)
            : null;
          const photoUrls = (a.photo_paths ?? [])
            .map((p) => urlByPath.get(p))
            .filter((u): u is string => Boolean(u));

          return (
            <li
              key={a.id}
              className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-medium">
                  {a.first_name} {a.last_name}
                </span>
                <span className="text-sm text-ink-dim">{a.city}</span>
                <span className="font-mono text-xs text-accent">
                  {a.referral_code}
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    STATUS_STYLES[a.status] ?? STATUS_STYLES.pending
                  }`}
                >
                  {a.status}
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

              {/* Vetting media (selfie + photos), shown via signed URLs. */}
              {(selfieUrl || photoUrls.length > 0) && (
                <div className="flex flex-wrap gap-2">
                  {selfieUrl && (
                    <a
                      href={selfieUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="group relative"
                      title="Selfie"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selfieUrl}
                        alt={`${a.first_name}'s selfie`}
                        className="size-20 rounded-lg border border-accent/40 object-cover"
                      />
                      <span className="absolute bottom-0 left-0 rounded-tr-lg rounded-bl-lg bg-night/80 px-1.5 py-0.5 text-[10px] text-accent">
                        selfie
                      </span>
                    </a>
                  )}
                  {photoUrls.map((url, i) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      title={`Photo ${i + 1}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`${a.first_name}'s photo ${i + 1}`}
                        className="size-20 rounded-lg border border-line object-cover"
                      />
                    </a>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-4 text-sm">
                {a.consent_personal_data && (
                  <span className="text-xs text-ink-dim">
                    ✓ consented to data use
                  </span>
                )}
                {a.reviewed_at && (
                  <span className="text-xs text-ink-dim">
                    reviewed{" "}
                    {new Date(a.reviewed_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      timeZone: "Asia/Kolkata",
                    })}
                  </span>
                )}
                {a.referred_by && (
                  <span className="text-ink-dim">
                    Referred by{" "}
                    <span className="font-mono text-ink">{a.referred_by}</span>
                  </span>
                )}
                {a.utm_source && (
                  <span className="text-ink-dim">
                    via <span className="text-ink">{a.utm_source}</span>
                    {a.utm_campaign ? ` / ${a.utm_campaign}` : ""}
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

              {a.reviewer_note && (
                <p className="rounded-lg border border-line bg-night/40 px-3 py-2 text-sm text-ink-dim">
                  {a.reviewer_note}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
