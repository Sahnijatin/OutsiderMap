import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { overtureImportStatus } from "@/lib/admin/jobs";
import { JobRunner } from "./job-runner";
import {
  enrichDraftsAction,
  importOvertureAction,
  resolvePlaceIdsAction,
} from "./actions";

export const dynamic = "force-dynamic";

/**
 * Catalog jobs, without a terminal.
 *
 * These were `node scripts/...` one-offs, which quietly assumed whoever runs
 * the catalog has a checkout and a shell. That is the wrong assumption for the
 * person actually curating places, so they live here instead.
 */
export default async function AdminDataPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const [imported, counts] = await Promise.all([
    overtureImportStatus(admin, "delhi").catch(() => ({ imported: 0, total: 0 })),
    (async () => {
      const [published, unpublished, pinned, unpinned] = await Promise.all([
        admin
          .from("places")
          .select("id", { count: "exact", head: true })
          .eq("is_published", true),
        admin
          .from("places")
          .select("id", { count: "exact", head: true })
          .eq("is_published", false),
        admin
          .from("places")
          .select("id", { count: "exact", head: true })
          .not("google_place_id", "is", null),
        admin
          .from("places")
          .select("id", { count: "exact", head: true })
          .is("google_place_id", null)
          .eq("is_published", true)
          .not("lat", "is", null),
      ]);
      return {
        published: published.count ?? 0,
        unpublished: unpublished.count ?? 0,
        pinned: pinned.count ?? 0,
        unpinned: unpinned.count ?? 0,
      };
    })(),
  ]);

  const env = serverEnv();
  const hasGoogleKey = Boolean(env.GOOGLE_MAPS_API_KEY);
  const hasAiKey = Boolean(env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY);

  const { count: thinDrafts } = await admin
    .from("places")
    .select("id", { count: "exact", head: true })
    .eq("is_published", false)
    .eq("geo_source", "overture")
    .is("description", null);

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl italic">Catalog jobs</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Long jobs run in batches and keep their progress in the database, so
          you can stop one and pick it up later without losing work.
        </p>
      </header>

      <dl className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Published", counts.published],
          ["Drafts", counts.unpublished],
          ["Exact pins", counts.pinned],
          ["Pins to resolve", counts.unpinned],
        ].map(([label, value]) => (
          <div
            key={label as string}
            className="rounded-card border border-line bg-surface p-3"
          >
            <dt className="text-xs text-ink-dim">{label}</dt>
            <dd className="mt-0.5 font-display text-xl">
              {(value as number).toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>

      <section className="mb-6 rounded-card border border-line bg-surface p-5">
        <h2 className="font-display text-lg italic">Import NCR candidates</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-dim">
          Loads places from the Overture extract in the repo. Chains are
          dropped, anything ambiguous is held back, and everything that lands
          is an <strong className="text-ink">unpublished draft</strong> - a name
          and a point is not a reason to go, so someone still has to write the
          editor note before it appears.
        </p>
        <div className="mt-4">
          <JobRunner
            action={importOvertureAction}
            label="Import candidates"
            runningLabel="Importing"
            total={imported.total}
            done={imported.imported}
            unit="candidates processed"
          />
        </div>
      </section>

      <section className="mt-6 rounded-card border border-line bg-surface p-5">
        <h2 className="font-display text-lg italic">Fill in the drafts</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-dim">
          Reads each venue&apos;s own website or Instagram and writes a
          description from what is actually there. A venue whose page says
          nothing useful is <strong className="text-ink">left blank on
          purpose</strong> - inventing &quot;a cosy neighbourhood
          favourite&quot; would be a lie about a real business, and someone
          would act on it. Those need a scout, not a model.
        </p>
        {!hasAiKey && (
          <p className="mt-3 rounded-card border border-line bg-raise p-3 text-xs text-ink-dim">
            Needs <code className="text-ink">OPENAI_API_KEY</code> or{" "}
            <code className="text-ink">ANTHROPIC_API_KEY</code> in Vercel.
          </p>
        )}
        <div className="mt-4">
          <JobRunner
            action={enrichDraftsAction}
            label="Fill in drafts"
            runningLabel="Writing"
            total={0}
            done={0}
            unit="drafts"
          />
          <p className="mt-2 text-xs text-ink-dim">
            {(thinDrafts ?? 0).toLocaleString()} drafts have no description yet.
          </p>
        </div>
      </section>

      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="font-display text-lg italic">Resolve navigation pins</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-dim">
          Finds each place&apos;s Google place_id so Directions opens the exact
          venue instead of searching for the name. Deliberately cautious: a
          wrong match sends people confidently to the wrong restaurant, so
          anything uncertain is left alone for a human.
        </p>
        {!hasGoogleKey && (
          <p className="mt-3 rounded-card border border-line bg-raise p-3 text-xs text-ink-dim">
            Needs <code className="text-ink">GOOGLE_MAPS_API_KEY</code> in
            Vercel, with Places API (New) enabled. Add it under Settings -&gt;
            Environment Variables, then redeploy.
          </p>
        )}
        <div className="mt-4">
          <JobRunner
            action={resolvePlaceIdsAction}
            label="Resolve pins"
            runningLabel="Resolving"
            total={counts.pinned + counts.unpinned}
            done={counts.pinned}
            unit="places pinned"
          />
        </div>
      </section>
    </div>
  );
}
