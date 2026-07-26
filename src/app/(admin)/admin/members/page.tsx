import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatOutsiderNumber } from "@/lib/identity/username";

export const metadata: Metadata = { title: "Members · Admin" };

const PAGE_SIZE = 50;

/** Escape ilike wildcards and the or() separator. */
function escapeQuery(q: string) {
  return q.replace(/[%_,()]/g, "").trim();
}

/**
 * The member roster: outsider number, identity, city, activity
 * counts. Read-only v1 - layout-level requireAdmin gates this.
 */
// future: ban/delete actions
export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q: rawQ, page: rawPage } = await searchParams;
  const q = escapeQuery(rawQ ?? "");
  const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const admin = createAdminClient();

  let query = admin
    .from("profiles")
    .select(
      "id, outsider_number, username, display_name, home_city, onboarding_completed_at, created_at",
      { count: "exact" },
    )
    .order("outsider_number", { ascending: true, nullsFirst: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (q) {
    query = query.or(`username.ilike.%${q}%,display_name.ilike.%${q}%`);
  }
  const { data: members, count } = await query;

  const ids = (members ?? []).map((m) => m.id);
  const quests = ids.length
    ? await admin.from("quests").select("user_id").in("user_id", ids)
    : { data: [] };
  const questCounts = new Map<string, number>();
  for (const row of quests.data ?? []) {
    questCounts.set(row.user_id, (questCounts.get(row.user_id) ?? 0) + 1);
  }

  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) =>
    `/admin/members?${new URLSearchParams({
      ...(q ? { q } : {}),
      page: String(p),
    }).toString()}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl italic">Members</h2>
          <p className="mt-1 text-sm text-ink-dim">
            {total} outsider{total === 1 ? "" : "s"}
            {q ? ` matching "${q}"` : ""} · page {page} of {lastPage}
          </p>
        </div>
        <form action="/admin/members" className="flex items-center gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="username or display name"
            className="rounded-card border border-line bg-surface px-4 py-2 text-sm text-ink outline-none placeholder:text-ink-dim focus:border-accent/60"
          />
          <button
            type="submit"
            className="rounded-full border border-line px-4 py-2 text-sm text-ink-dim transition-colors hover:text-ink"
          >
            Search
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-card border border-line">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-ink-dim">
              <th className="px-4 py-3 font-normal">#</th>
              <th className="px-4 py-3 font-normal">Username</th>
              <th className="px-4 py-3 font-normal">Display name</th>
              <th className="px-4 py-3 font-normal">City</th>
              <th className="px-4 py-3 font-normal">Onboarded</th>
              <th className="px-4 py-3 font-normal">Quests</th>
              <th className="px-4 py-3 font-normal">Joined</th>
            </tr>
          </thead>
          <tbody>
            {(members ?? []).map((m) => {
              return (
                <tr key={m.id} className="border-b border-line">
                  <td className="px-4 py-2.5 font-mono text-xs text-accent">
                    {formatOutsiderNumber(m.outsider_number)}
                  </td>
                  <td className="px-4 py-2.5">
                    {m.username ? `@${m.username}` : "-"}
                  </td>
                  <td className="max-w-40 truncate px-4 py-2.5 text-ink-dim">
                    {m.display_name ?? "-"}
                  </td>
                  <td className="px-4 py-2.5 capitalize text-ink-dim">
                    {m.home_city ?? "-"}
                  </td>
                  <td className="px-4 py-2.5 text-ink-dim">
                    {m.onboarding_completed_at ? "yes" : "no"}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {questCounts.get(m.id) ?? 0}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink-dim">
                    {new Date(m.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "2-digit",
                      timeZone: "Asia/Kolkata",
                    })}
                  </td>
                </tr>
              );
            })}
            {(members ?? []).length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-ink-dim">
                  Nobody matches.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        {page > 1 && (
          <Link
            href={pageHref(page - 1)}
            className="rounded-full border border-line px-4 py-1.5 text-sm text-ink-dim transition-colors hover:text-ink"
          >
            ← Newer
          </Link>
        )}
        {page < lastPage && (
          <Link
            href={pageHref(page + 1)}
            className="rounded-full border border-line px-4 py-1.5 text-sm text-ink-dim transition-colors hover:text-ink"
          >
            Older →
          </Link>
        )}
      </div>
    </div>
  );
}
