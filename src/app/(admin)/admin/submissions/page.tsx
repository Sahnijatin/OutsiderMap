import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { deletePlace } from "../places/actions";

export const metadata: Metadata = {
  title: "Admin · Submissions",
};

export default async function SubmissionsPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: submissions } = await admin
    .from("places")
    .select("id, name, area, category, description, created_at")
    .eq("source", "submitted")
    .eq("is_published", false)
    .order("created_at", { ascending: true });

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl">Submissions</h1>
        <p className="text-sm text-ink-dim">
          Member-suggested places. Open one to flesh it out and publish, or
          drop it.
        </p>
      </header>

      {(!submissions || submissions.length === 0) && (
        <p className="text-sm text-ink-dim">Queue&rsquo;s clear.</p>
      )}

      <ul className="flex flex-col gap-3">
        {(submissions ?? []).map((submission) => (
          <li
            key={submission.id}
            className="flex flex-col gap-2 rounded-card border border-line bg-surface p-5"
          >
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="font-medium">{submission.name}</span>
              <span className="text-sm text-ink-dim">
                {[submission.area, submission.category]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span className="ml-auto font-mono text-xs text-ink-dim">
                {new Date(submission.created_at).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  timeZone: "Asia/Kolkata",
                })}
              </span>
            </div>
            {submission.description && (
              <p className="text-sm leading-relaxed text-ink-dim">
                {submission.description}
              </p>
            )}
            <div className="mt-1 flex items-center gap-4">
              <Link
                href={`/admin/places/${submission.id}`}
                className="text-sm text-accent hover:underline"
              >
                Review &amp; publish →
              </Link>
              <form action={deletePlace}>
                <input type="hidden" name="id" value={submission.id} />
                <button
                  type="submit"
                  className="text-sm text-ink-dim transition-colors hover:text-danger"
                >
                  Drop
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
