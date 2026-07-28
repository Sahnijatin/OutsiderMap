import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { HARVEST_CATEGORIES, loadHarvestGeography } from "@/lib/harvest/registry";
import type { StorySignal } from "@/lib/harvest/story";
import { publicMediaUrl } from "@/lib/media/url";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  addCandidateEmbed,
  addHarvestCity,
  approveHarvestCandidate,
  markNeedsVisit,
  rejectHarvestCandidate,
  removeHarvestCity,
  startHarvest,
  uploadCandidatePhoto,
} from "./actions";
import { GeoPicker, type GeoPickerState } from "./geo-picker";
import { HarvestProgress } from "./harvest-progress";

export const metadata: Metadata = { title: "Harvest · Admin" };

/**
 * The in-console scout: start a harvest (state -> cities -> categories),
 * watch the queue advance, then review candidates with full control - the
 * quoted evidence, dedupe context, attached photos/reels - and Approve to
 * publish, Reject, or flag for a real visit. Nothing goes live without the
 * reviewer's click.
 */
export default async function AdminHarvestPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; city?: string; category?: string }>;
}) {
  await requireAdmin();
  const admin = createAdminClient();
  const filters = await searchParams;

  // Every recent run stays on the page - a new harvest never hides an older
  // one still under review. Filters narrow the shared review list.
  const { data: runs } = await admin
    .from("scout_runs")
    .select("id, state, cities, categories, status, min_rating, min_reviews, created_at")
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(20);
  const runIds = (runs ?? []).map((r) => r.id);
  const runFilter = runIds.includes(filters.run ?? "") ? filters.run : undefined;

  let progress = null;
  let reviewable: Array<Record<string, unknown>> = [];
  let gated: Array<Record<string, unknown>> = [];
  let facets: Array<{ city_slug: string; city_name: string; category: string }> = [];
  const mediaByCandidate = new Map<string, Array<{ kind: string; storage_path: string | null; source_url: string | null; author_name: string | null }>>();
  let handled = { approved: 0, rejected: 0, needs_visit: 0 };

  if (runIds.length > 0) {
    const activeIds = (runs ?? []).filter((r) => r.status === "active").map((r) => r.id);
    if (activeIds.length > 0) {
      const [{ count: total }, { count: done }, { count: failed }, { count: candidates }] =
        await Promise.all([
          admin.from("scout_tasks").select("id", { count: "exact", head: true }).in("run_id", activeIds),
          admin.from("scout_tasks").select("id", { count: "exact", head: true }).in("run_id", activeIds).eq("status", "done"),
          admin.from("scout_tasks").select("id", { count: "exact", head: true }).in("run_id", activeIds).eq("status", "failed"),
          admin.from("scout_candidates").select("id", { count: "exact", head: true }).in("run_id", activeIds),
        ]);
      progress = {
        runId: activeIds.join(","),
        status: "active",
        totalTasks: total ?? 0,
        doneTasks: done ?? 0,
        failedTasks: failed ?? 0,
        candidates: candidates ?? 0,
      };
    }

    // Filter facets come from everything pending, unfiltered - so a chip for
    // "Kochi" stays visible while you're looking at Delhi.
    const { data: facetRows } = await admin
      .from("scout_candidates")
      .select("city_slug, city_name, category")
      .in("run_id", runIds)
      .eq("status", "pending")
      .limit(2000);
    facets = facetRows ?? [];

    let pendingQuery = admin
      .from("scout_candidates")
      .select("*")
      .eq("status", "pending")
      .order("score", { ascending: false })
      .limit(200);
    pendingQuery = runFilter
      ? pendingQuery.eq("run_id", runFilter)
      : pendingQuery.in("run_id", runIds);
    if (filters.city) pendingQuery = pendingQuery.eq("city_slug", filters.city);
    if (filters.category) pendingQuery = pendingQuery.eq("category", filters.category);
    const { data: pending } = await pendingQuery;
    reviewable = (pending ?? []).filter((c) => !c.gate_reason) as never;
    gated = (pending ?? []).filter((c) => c.gate_reason) as never;

    const ids = (pending ?? []).map((c) => c.id);
    if (ids.length > 0) {
      const { data: media } = await admin
        .from("scout_candidate_media")
        .select("candidate_id, kind, storage_path, source_url, author_name")
        .in("candidate_id", ids);
      for (const m of media ?? []) {
        const list = mediaByCandidate.get(m.candidate_id) ?? [];
        list.push(m);
        mediaByCandidate.set(m.candidate_id, list);
      }
    }

    const [{ count: approved }, { count: rejected }, { count: needsVisit }] =
      await Promise.all([
        admin.from("scout_candidates").select("id", { count: "exact", head: true }).in("run_id", runIds).eq("status", "approved"),
        admin.from("scout_candidates").select("id", { count: "exact", head: true }).in("run_id", runIds).eq("status", "rejected"),
        admin.from("scout_candidates").select("id", { count: "exact", head: true }).in("run_id", runIds).eq("status", "needs_visit"),
      ]);
    handled = {
      approved: approved ?? 0,
      rejected: rejected ?? 0,
      needs_visit: needsVisit ?? 0,
    };
  }

  const geography = await loadHarvestGeography(admin);
  // Delhi first (home turf), then the rest of India alphabetically.
  const pickerStates: GeoPickerState[] = Object.entries(geography)
    .sort(([a, sa], [b, sb]) =>
      a === "delhi" ? -1 : b === "delhi" ? 1 : sa.name.localeCompare(sb.name),
    )
    .map(([slug, state]) => ({
      slug,
      name: state.name,
      cities: state.cities.map((c) => ({
        slug: c.slug,
        name: c.name,
        custom: c.custom,
      })),
    }));

  const { data: customCities } = await admin
    .from("harvest_cities")
    .select("id, name, state_name, lat, lng, radius_m")
    .order("created_at", { ascending: false });

  // Facet chips, deduped from everything pending across all runs.
  const cityFacets = [...new Map(facets.map((f) => [f.city_slug, f.city_name]))];
  const categoryFacets = [...new Set(facets.map((f) => f.category))].sort();

  const href = (patch: {
    run?: string | null;
    city?: string | null;
    category?: string | null;
  }) => {
    const merged = {
      run: patch.run === undefined ? (runFilter ?? null) : patch.run,
      city: patch.city === undefined ? (filters.city ?? null) : patch.city,
      category:
        patch.category === undefined ? (filters.category ?? null) : patch.category,
    };
    const p = new URLSearchParams();
    if (merged.run) p.set("run", merged.run);
    if (merged.city) p.set("city", merged.city);
    if (merged.category) p.set("category", merged.category);
    const qs = p.toString();
    return qs ? `/admin/harvest?${qs}` : "/admin/harvest";
  };

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="font-display text-2xl italic">Harvest</h2>
        <p className="mt-1 max-w-xl text-sm text-ink-dim">
          Sweep a region for places worth the map. Sources: Google Places
          (official API) + OpenStreetMap. Everything lands here for YOUR
          review - approve is what publishes.
        </p>
        <form action={startHarvest} className="mt-4 flex flex-col gap-4">
          <GeoPicker states={pickerStates} />
          <div>
            <p className="voice">categories</p>
            <div className="mt-2 flex flex-wrap gap-3">
              {Object.keys(HARVEST_CATEGORIES).map((cat) => (
                <label key={cat} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    name="categories"
                    value={cat}
                    defaultChecked={cat === "cafe" || cat === "restaurant"}
                  />
                  {cat}
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-4 text-sm">
            <label className="flex flex-col gap-1">
              <span className="voice">min rating</span>
              <input type="number" name="minRating" defaultValue="4.3" step="0.1" min="3" max="5" className="w-24 rounded-card border border-line bg-surface px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="voice">min reviews</span>
              <input type="number" name="minReviews" defaultValue="300" min="0" className="w-28 rounded-card border border-line bg-surface px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="voice">per query</span>
              <input type="number" name="maxPerQuery" defaultValue="60" min="20" max="60" className="w-24 rounded-card border border-line bg-surface px-3 py-2" />
            </label>
            <Button type="submit" size="sm">Start harvest</Button>
          </div>
        </form>
      </section>

      <section>
        <h3 className="font-display text-xl italic">Add a city</h3>
        <p className="mt-1 max-w-xl text-sm text-ink-dim">
          Anywhere in India. Name it and we locate it (leave lat/lng blank);
          it joins its state in the picker above immediately.
        </p>
        <form action={addHarvestCity} className="mt-3 flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="voice">state</span>
            <input name="stateName" required placeholder="e.g. Kerala" className="w-40 rounded-card border border-line bg-surface px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="voice">city / town</span>
            <input name="cityName" required placeholder="e.g. Fort Kochi" className="w-44 rounded-card border border-line bg-surface px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="voice">radius km</span>
            <input type="number" name="radiusKm" defaultValue="10" min="1" max="50" className="w-24 rounded-card border border-line bg-surface px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="voice">lat (optional)</span>
            <input type="number" name="lat" step="any" placeholder="auto" className="w-28 rounded-card border border-line bg-surface px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="voice">lng (optional)</span>
            <input type="number" name="lng" step="any" placeholder="auto" className="w-28 rounded-card border border-line bg-surface px-3 py-2" />
          </label>
          <Button type="submit" size="sm" variant="secondary">Add city</Button>
        </form>
        {(customCities ?? []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {customCities!.map((c) => (
              <form key={c.id} action={removeHarvestCity} className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs">
                <input type="hidden" name="id" value={c.id} />
                <span>
                  {c.name} · {c.state_name} · {Math.round(c.radius_m / 1000)}km
                </span>
                <button type="submit" aria-label={`Remove ${c.name}`} className="text-ink-dim transition-colors hover:text-danger">
                  ✕
                </button>
              </form>
            ))}
          </div>
        )}
      </section>

      {progress && <HarvestProgress key={progress.runId} initial={progress} />}

      {(runs ?? []).length > 0 && (
        <section>
          <h2 className="font-display text-2xl italic">
            Review ({reviewable.length})
          </h2>
          <p className="mt-1 text-xs text-ink-dim">
            {handled.approved} approved · {handled.rejected} rejected ·{" "}
            {handled.needs_visit} flagged for a visit · across all runs
          </p>

          {/* Filters: every run stays reviewable side by side. */}
          <div className="mt-3 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <FilterChip href={href({ run: null })} active={!runFilter} clearable={false}>
                all runs
              </FilterChip>
              {(runs ?? []).map((r) => (
                <FilterChip
                  key={r.id}
                  href={href({ run: runFilter === r.id ? null : r.id })}
                  active={runFilter === r.id}
                >
                  {geography[r.state]?.name ?? r.state} ·{" "}
                  {new Date(r.created_at).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: "Asia/Kolkata",
                  })}
                  {r.status === "active" ? " · sweeping" : ""}
                </FilterChip>
              ))}
            </div>
            {cityFacets.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <FilterChip href={href({ city: null })} active={!filters.city} clearable={false}>
                  all cities
                </FilterChip>
                {cityFacets.map(([slug, name]) => (
                  <FilterChip
                    key={slug}
                    href={href({ city: filters.city === slug ? null : slug })}
                    active={filters.city === slug}
                  >
                    {name}
                  </FilterChip>
                ))}
              </div>
            )}
            {categoryFacets.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <FilterChip href={href({ category: null })} active={!filters.category} clearable={false}>
                  all categories
                </FilterChip>
                {categoryFacets.map((cat) => (
                  <FilterChip
                    key={cat}
                    href={href({ category: filters.category === cat ? null : cat })}
                    active={filters.category === cat}
                  >
                    {cat}
                  </FilterChip>
                ))}
              </div>
            )}
          </div>

          {reviewable.length === 0 ? (
            <p className="mt-3 text-sm text-ink-dim">
              Nothing waiting here - widen the filters, start a harvest, or
              check the gate section.
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-4">
              {reviewable.map((c) => (
                <CandidateCard
                  key={String(c.id)}
                  candidate={c as never}
                  media={mediaByCandidate.get(String(c.id)) ?? []}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {gated.length > 0 && (
        <details>
          <summary className="cursor-pointer font-display text-xl italic">
            Held by the quality gate ({gated.length})
          </summary>
          <div className="mt-3 flex flex-col gap-2">
            {gated.map((c) => (
              <div key={String(c.id)} className="flex items-center justify-between gap-3 rounded-card border border-line p-3 text-sm">
                <span className="truncate">
                  {String(c.name)} · {String(c.city_name)}
                </span>
                <span className="shrink-0 font-mono text-xs text-danger">
                  {String(c.gate_reason)}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * A selected chip links to its own removal (tap again = clear), and wears a
 * small x to say so. The "all ..." chips clear their whole dimension.
 */
function FilterChip({
  href,
  active,
  clearable = true,
  children,
}: {
  href: string;
  active: boolean;
  clearable?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? "border-accent/60 bg-accent/15 text-accent"
          : "border-line text-ink-dim hover:text-ink"
      }`}
    >
      {children}
      {active && clearable && <span aria-hidden> ✕</span>}
    </Link>
  );
}

type Candidate = {
  id: string;
  name: string;
  city_name: string;
  address: string | null;
  category: string;
  rating: number | null;
  review_count: number | null;
  price_level: number | null;
  sources: string[];
  story_signals: unknown;
  maps_url: string | null;
  website: string | null;
  score: number;
};

function CandidateCard({
  candidate,
  media,
}: {
  candidate: Candidate;
  media: Array<{ kind: string; storage_path: string | null; source_url: string | null; author_name: string | null }>;
}) {
  const signals: StorySignal[] = Array.isArray(candidate.story_signals)
    ? (candidate.story_signals as StorySignal[])
    : [];
  const photos = media.filter((m) => m.kind === "image" && m.storage_path);
  const embeds = media.filter((m) => m.kind === "embed");

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg italic">{candidate.name}</p>
          <p className="mt-0.5 text-xs text-ink-dim">
            {[
              candidate.category,
              candidate.city_name,
              candidate.rating != null
                ? `${candidate.rating}★ (${candidate.review_count ?? "?"} reviews)`
                : null,
              candidate.price_level ? "₹".repeat(candidate.price_level) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {candidate.address && (
            <p className="mt-0.5 text-xs text-ink-dim">{candidate.address}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {candidate.maps_url && (
            <a href={candidate.maps_url} target="_blank" rel="noopener noreferrer" className="text-xs underline">
              maps
            </a>
          )}
          <Badge variant="accent">score {candidate.score}</Badge>
        </div>
      </div>

      {signals.length > 0 && (
        <ul className="flex flex-col gap-1">
          {signals.slice(0, 4).map((s, i) => (
            <li key={i} className="border-l-2 border-accent/60 pl-2 text-sm italic text-ink-dim">
              <span className="not-italic text-xs text-accent">[{s.tag}]</span>{" "}
              &ldquo;{s.quote}&rdquo;
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {photos.map((p) => {
          const url = publicMediaUrl("place-images", p.storage_path);
          return url ? (
            <Image
              key={p.storage_path}
              src={url}
              alt=""
              width={72}
              height={72}
              className="size-16 rounded-xl object-cover"
            />
          ) : null;
        })}
        {embeds.map((e, i) => (
          <a
            key={i}
            href={e.source_url ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-line px-3 py-1 text-xs text-ink-dim underline"
          >
            embed · {e.author_name}
          </a>
        ))}
        <form action={uploadCandidatePhoto} className="flex items-center gap-2">
          <input type="hidden" name="id" value={candidate.id} />
          <input type="file" name="photo" accept="image/*" className="max-w-44 text-xs" />
          <Button type="submit" size="sm" variant="secondary">Add photo</Button>
        </form>
        <form action={addCandidateEmbed} className="flex items-center gap-2">
          <input type="hidden" name="id" value={candidate.id} />
          <input name="url" placeholder="Reel/video link" className="w-40 rounded-card border border-line bg-surface px-2 py-1 text-xs" />
          <input name="author" placeholder="Creator handle" className="w-32 rounded-card border border-line bg-surface px-2 py-1 text-xs" />
          <Button type="submit" size="sm" variant="secondary">Add embed</Button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form action={approveHarvestCandidate}>
          <input type="hidden" name="id" value={candidate.id} />
          <Button type="submit" size="sm">Approve → publish</Button>
        </form>
        <form action={markNeedsVisit}>
          <input type="hidden" name="id" value={candidate.id} />
          <Button type="submit" size="sm" variant="secondary">Needs visit</Button>
        </form>
        <form action={rejectHarvestCandidate} className="flex items-center gap-2">
          <input type="hidden" name="id" value={candidate.id} />
          <input name="note" placeholder="why (optional)" className="w-36 rounded-card border border-line bg-surface px-2 py-1 text-xs" />
          <Button type="submit" size="sm" variant="danger">Reject</Button>
        </form>
      </div>
    </Card>
  );
}
