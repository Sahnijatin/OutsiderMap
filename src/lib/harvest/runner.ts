import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HARVEST_CATEGORIES,
  loadHarvestGeography,
  resolveHarvestCities,
} from "@/lib/harvest/registry";
import { gateReason, qualityScore } from "@/lib/harvest/quality";
import { extractStorySignals, mergeKey, type Passage } from "@/lib/harvest/story";
import { googleDiscover, osmDiscover, type Sighting } from "@/lib/harvest/sources";
import { serverEnv } from "@/lib/env";
import type { Database, Json } from "@/types/database";

/**
 * The harvest queue: a run expands into city x category x source tasks; each
 * processing tick claims a small batch sized for one serverless invocation
 * (Google tasks are seconds; OSM tasks up to ~50s, so at most one per tick,
 * and only after a courtesy gap). Sightings merge into scout_candidates by
 * normalized identity, so the reviewer sees one row per physical place with
 * all the evidence attached.
 */

const OSM_COURTESY_GAP_MS = 8_000;

export async function createHarvestRun(
  admin: SupabaseClient<Database>,
  createdBy: string,
  input: {
    state: string;
    cities: string[];
    categories: string[];
    minRating: number;
    minReviews: number;
    maxPerQuery: number;
  },
) {
  const geography = await loadHarvestGeography(admin);
  const cities = resolveHarvestCities(geography, input.state, input.cities);
  const categories = input.categories.filter((c) => HARVEST_CATEGORIES[c]);
  if (categories.length === 0) throw new Error("No valid categories selected.");

  const { data: run, error } = await admin
    .from("scout_runs")
    .insert({
      created_by: createdBy,
      state: input.state,
      cities: cities.map((c) => c.slug),
      categories,
      min_rating: input.minRating,
      min_reviews: input.minReviews,
      max_per_query: input.maxPerQuery,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const sources: Array<"google" | "osm"> = serverEnv().GOOGLE_MAPS_API_KEY
    ? ["google", "osm"]
    : ["osm"];
  const tasks = cities.flatMap((city) =>
    categories.flatMap((category) =>
      sources.map((source) => ({
        run_id: run.id,
        city_slug: city.slug,
        city_name: city.name,
        lat: city.lat,
        lng: city.lng,
        radius_m: city.radiusM,
        category,
        source,
      })),
    ),
  );
  const { error: taskError } = await admin.from("scout_tasks").insert(tasks);
  if (taskError) throw new Error(taskError.message);
  return { runId: run.id, tasks: tasks.length, googleEnabled: sources.includes("google") };
}

/** Merge one task's sightings into scout_candidates (upsert by merge_key). */
async function mergeSightings(
  admin: SupabaseClient<Database>,
  run: { id: string; min_rating: number; min_reviews: number },
  task: { city_slug: string; city_name: string; category: string },
  sightings: Sighting[],
) {
  for (const s of sightings) {
    const key = mergeKey(s.name, task.city_slug);
    const { data: existing } = await admin
      .from("scout_candidates")
      .select("id, sources, story_signals, rating, review_count, name, address, lat, lng, price_level, website, maps_url, google_place_id")
      .eq("run_id", run.id)
      .eq("merge_key", key)
      .maybeSingle();

    const passages: Passage[] = s.passages;
    if (existing) {
      const sources = [...new Set([...existing.sources, s.source])];
      const priorSignals = Array.isArray(existing.story_signals)
        ? (existing.story_signals as unknown as Passage[])
        : [];
      // Re-extract over prior quotes + new passages so dedupe holds.
      const signals = extractStorySignals([
        ...(priorSignals as unknown as Array<{ quote: string; source: string }>).map(
          (p) => ({ text: p.quote, source: p.source }),
        ),
        ...passages,
      ]);
      const merged = {
        rating: existing.rating ?? s.rating,
        review_count: existing.review_count ?? s.reviewCount,
        name: existing.name,
        sources,
      };
      const scorable = {
        name: merged.name,
        rating: merged.rating,
        reviewCount: merged.review_count,
        sources,
        storySignals: signals,
      };
      await admin
        .from("scout_candidates")
        .update({
          sources,
          story_signals: signals as unknown as Json,
          rating: merged.rating,
          review_count: merged.review_count,
          address: existing.address ?? s.address,
          lat: existing.lat ?? s.lat,
          lng: existing.lng ?? s.lng,
          price_level: existing.price_level ?? s.priceLevel,
          website: existing.website ?? s.website,
          maps_url: existing.maps_url ?? s.mapsUrl,
          google_place_id: existing.google_place_id ?? s.googlePlaceId,
          score: qualityScore(scorable),
          gate_reason: gateReason(scorable, {
            minRating: run.min_rating,
            minReviews: run.min_reviews,
          }),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      const signals = extractStorySignals(passages);
      const scorable = {
        name: s.name,
        rating: s.rating,
        reviewCount: s.reviewCount,
        sources: [s.source],
        storySignals: signals,
      };
      await admin.from("scout_candidates").upsert(
        {
          run_id: run.id,
          merge_key: key,
          name: s.name,
          city_slug: task.city_slug,
          city_name: task.city_name,
          address: s.address,
          lat: s.lat,
          lng: s.lng,
          category: task.category,
          rating: s.rating,
          review_count: s.reviewCount,
          price_level: s.priceLevel,
          sources: [s.source],
          story_signals: signals as unknown as Json,
          google_place_id: s.googlePlaceId,
          website: s.website,
          maps_url: s.mapsUrl,
          score: qualityScore(scorable),
          gate_reason: gateReason(scorable, {
            minRating: run.min_rating,
            minReviews: run.min_reviews,
          }),
        },
        { onConflict: "run_id,merge_key", ignoreDuplicates: true },
      );
    }
  }
}

/**
 * One processing tick: claim and execute a small batch of pending tasks.
 * Called from the Harvest page's poll (and any admin action) via after() -
 * the queue advances while someone is watching, and stragglers are cheap to
 * re-kick.
 */
export async function processScoutTasks(admin: SupabaseClient<Database>) {
  const { data: runs } = await admin
    .from("scout_runs")
    .select("id, min_rating, min_reviews, max_per_query, status")
    .eq("status", "active");
  if (!runs?.length) return { processed: 0 };

  let processed = 0;
  for (const run of runs) {
    const { data: pending } = await admin
      .from("scout_tasks")
      .select("id, city_slug, city_name, lat, lng, radius_m, category, source")
      .eq("run_id", run.id)
      .eq("status", "pending")
      .order("created_at")
      .limit(6);
    if (!pending?.length) {
      // No pending tasks left; the run is done when nothing is running either.
      const { data: active } = await admin
        .from("scout_tasks")
        .select("id")
        .eq("run_id", run.id)
        .in("status", ["pending", "running"])
        .limit(1);
      if (!active?.length) {
        await admin
          .from("scout_runs")
          .update({ status: "done", updated_at: new Date().toISOString() })
          .eq("id", run.id)
          .eq("status", "active");
      }
      continue;
    }

    // Budget per tick: a few google tasks OR one osm task (osm is slow and
    // the donated server deserves spacing between our queries).
    const googleTasks = pending.filter((t) => t.source === "google").slice(0, 2);
    let osmTask = pending.find((t) => t.source === "osm") ?? null;
    if (osmTask) {
      const { data: lastOsm } = await admin
        .from("scout_tasks")
        .select("updated_at")
        .eq("source", "osm")
        .in("status", ["done", "failed", "running"])
        .order("updated_at", { ascending: false })
        .limit(1);
      const last = lastOsm?.[0]?.updated_at;
      if (last && Date.now() - new Date(last).getTime() < OSM_COURTESY_GAP_MS) {
        osmTask = null;
      }
    }
    const batch = googleTasks.length > 0 ? googleTasks : osmTask ? [osmTask] : [];

    for (const task of batch) {
      const { data: claimed } = await admin
        .from("scout_tasks")
        .update({ status: "running", updated_at: new Date().toISOString() })
        .eq("id", task.id)
        .eq("status", "pending")
        .select("id");
      if (!claimed?.length) continue;

      try {
        // The task carries its own geometry, so a run keeps working even if
        // the city was console-added (or removed) after the run started.
        const cityForTask = {
          slug: task.city_slug,
          name: task.city_name,
          lat: task.lat,
          lng: task.lng,
          radiusM: task.radius_m,
          productCity: null,
        };
        const sightings =
          task.source === "google"
            ? await googleDiscover(cityForTask, task.category, run.max_per_query)
            : await osmDiscover(cityForTask, task.category);
        await mergeSightings(admin, run, task, sightings);
        await admin
          .from("scout_tasks")
          .update({
            status: "done",
            found_count: sightings.length,
            error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", task.id);
      } catch (err) {
        await admin
          .from("scout_tasks")
          .update({
            status: "failed",
            error: (err instanceof Error ? err.message : String(err)).slice(0, 400),
            updated_at: new Date().toISOString(),
          })
          .eq("id", task.id);
      }
      processed += 1;
    }
  }
  return { processed };
}
