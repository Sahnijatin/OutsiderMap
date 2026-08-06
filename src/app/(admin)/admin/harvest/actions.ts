"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  MAX_ADMIN_MEDIA_BATCH,
  MAX_ADMIN_MEDIA_BYTES,
} from "@/lib/media/admin-media";
import { createHarvestRun, processScoutTasks } from "@/lib/harvest/runner";
import { approveCandidate } from "@/lib/harvest/approve";
import { geocodeCity } from "@/lib/harvest/geocode";
import { HARVEST_CATEGORIES, harvestCityBySlug } from "@/lib/harvest/registry";

const RunSchema = z.object({
  // Validated against the merged geography (static + console-added) inside
  // createHarvestRun - unknown states throw there with a clear message.
  state: z.string().min(1).max(80),
  cities: z.array(z.string()).min(1),
  categories: z
    .array(z.string().refine((c) => c in HARVEST_CATEGORIES, "unknown category"))
    .min(1),
  minRating: z.coerce.number().min(3).max(5),
  minReviews: z.coerce.number().int().min(0).max(100000),
  maxPerQuery: z.coerce.number().int().min(20).max(60),
});

export async function startHarvest(formData: FormData) {
  const profile = await requireAdmin();
  const input = RunSchema.parse({
    state: formData.get("state"),
    cities: formData.getAll("cities").map(String),
    categories: formData.getAll("categories").map(String),
    minRating: formData.get("minRating"),
    minReviews: formData.get("minReviews"),
    maxPerQuery: formData.get("maxPerQuery"),
  });
  const admin = createAdminClient();
  await createHarvestRun(admin, profile.id, input);
  after(async () => {
    try {
      await processScoutTasks(admin);
    } catch (err) {
      console.error("[harvest] initial tick failed", err);
    }
  });
  revalidatePath("/admin/harvest");
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const AddCitySchema = z.object({
  stateName: z.string().trim().min(2).max(60),
  cityName: z.string().trim().min(2).max(60),
  lat: z.coerce.number().min(6).max(38).optional(),
  lng: z.coerce.number().min(66).max(98).optional(),
  radiusKm: z.coerce.number().min(1).max(50),
});

/**
 * Console-added harvest geography: any city in any state, geocoded on entry
 * (Google Places when the key is set, Nominatim otherwise) unless the admin
 * pins coordinates by hand. If the catalog already has a live product city
 * with the same slug, approvals publish straight into it.
 */
export async function addHarvestCity(formData: FormData) {
  const profile = await requireAdmin();
  const input = AddCitySchema.parse({
    stateName: formData.get("stateName"),
    cityName: formData.get("cityName"),
    lat: formData.get("lat") || undefined,
    lng: formData.get("lng") || undefined,
    radiusKm: formData.get("radiusKm") || 10,
  });

  const citySlug = slugify(input.cityName);
  const stateSlug = slugify(input.stateName);
  if (!citySlug || !stateSlug) throw new Error("Name didn't survive slugging - use plain letters.");
  if (harvestCityBySlug(citySlug)) {
    throw new Error(`${input.cityName} is already in the built-in list - pick it from its state.`);
  }

  let lat = input.lat;
  let lng = input.lng;
  if (lat == null || lng == null) {
    const hit = await geocodeCity(input.cityName, input.stateName);
    if (!hit) {
      throw new Error(
        `Couldn't locate "${input.cityName}, ${input.stateName}" - check the spelling or enter lat/lng by hand.`,
      );
    }
    lat = hit.lat;
    lng = hit.lng;
  }

  const admin = createAdminClient();
  // If the catalog already runs a product city under this slug, wire the
  // mapping now so approvals publish straight into it.
  const { data: productCity } = await admin
    .from("cities")
    .select("slug")
    .eq("slug", citySlug)
    .maybeSingle();

  const { error } = await admin.from("harvest_cities").insert({
    state_slug: stateSlug,
    state_name: input.stateName,
    slug: citySlug,
    name: input.cityName,
    lat,
    lng,
    radius_m: Math.round(input.radiusKm * 1000),
    product_city: productCity?.slug ?? null,
    created_by: profile.id,
  });
  if (error) {
    throw new Error(
      error.message.includes("duplicate")
        ? `${input.cityName} is already added.`
        : error.message,
    );
  }
  revalidatePath("/admin/harvest");
}

export async function removeHarvestCity(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const admin = createAdminClient();
  // Tasks carry their own geometry, so removing a city never breaks a run
  // that's already sweeping it.
  await admin.from("harvest_cities").delete().eq("id", id);
  revalidatePath("/admin/harvest");
}

/**
 * One queue tick, called by the Harvest page's poller while an admin is
 * watching. Returns live progress so the page can render it without a
 * second round trip.
 */
export async function tickHarvest() {
  await requireAdmin();
  const admin = createAdminClient();
  try {
    await processScoutTasks(admin);
  } catch (err) {
    console.error("[harvest] tick failed", err);
  }
  // Progress aggregates every ACTIVE run - the tick advances all of them,
  // and parallel harvests (Delhi still under review, Kerala sweeping) are a
  // supported, normal state.
  const { data: activeRuns } = await admin
    .from("scout_runs")
    .select("id")
    .eq("status", "active");
  const ids = (activeRuns ?? []).map((r) => r.id);
  if (ids.length === 0) {
    return { runId: "all", status: "done", totalTasks: 0, doneTasks: 0, failedTasks: 0, candidates: 0 };
  }
  const [{ count: total }, { count: done }, { count: failed }, { count: candidates }] =
    await Promise.all([
      admin.from("scout_tasks").select("id", { count: "exact", head: true }).in("run_id", ids),
      admin.from("scout_tasks").select("id", { count: "exact", head: true }).in("run_id", ids).eq("status", "done"),
      admin.from("scout_tasks").select("id", { count: "exact", head: true }).in("run_id", ids).eq("status", "failed"),
      admin.from("scout_candidates").select("id", { count: "exact", head: true }).in("run_id", ids),
    ]);
  return {
    runId: ids.join(","),
    status: "active",
    totalTasks: total ?? 0,
    doneTasks: done ?? 0,
    failedTasks: failed ?? 0,
    candidates: candidates ?? 0,
  };
}

export async function approveHarvestCandidate(formData: FormData) {
  const profile = await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const admin = createAdminClient();
  await approveCandidate(admin, id, profile.id);
  revalidatePath("/admin/harvest");
  revalidatePath("/admin/places");
}

export async function rejectHarvestCandidate(formData: FormData) {
  const profile = await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const note = z.string().max(400).optional().parse(formData.get("note") ?? undefined);
  const admin = createAdminClient();
  await admin
    .from("scout_candidates")
    .update({
      status: "rejected",
      review_note: note || null,
      reviewed_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending");
  revalidatePath("/admin/harvest");
}

export async function markNeedsVisit(formData: FormData) {
  const profile = await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const admin = createAdminClient();
  await admin
    .from("scout_candidates")
    .update({
      status: "needs_visit",
      reviewed_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending");
  revalidatePath("/admin/harvest");
}

const AttachSchema = z.object({
  candidateId: z.string().uuid(),
  items: z
    .array(
      z.object({
        path: z.string().min(1).max(300),
        kind: z.enum(["image", "video"]),
      }),
    )
    .min(1)
    .max(MAX_ADMIN_MEDIA_BATCH),
});

/**
 * Record photos and clips the browser has already PUT to Storage.
 *
 * The bytes never come through here - the reviewer's browser uploaded them to
 * a server-issued signed URL (see /api/admin/media/upload-url), which is what
 * makes a video possible at all: a Server Action body caps out at 4MB. This
 * step verifies each object actually landed under this candidate's prefix and
 * writes the rows.
 */
export async function attachCandidateMedia(input: {
  candidateId: string;
  items: Array<{ path: string; kind: "image" | "video" }>;
}) {
  await requireAdmin();
  const { candidateId, items } = AttachSchema.parse(input);

  // Paths are server-issued and candidate-prefixed. Re-checking here means a
  // forged action call can't point a media row at someone else's object.
  const prefix = `harvest/${candidateId}/`;
  if (items.some((i) => !i.path.startsWith(prefix))) {
    throw new Error("Upload path doesn't belong to this candidate.");
  }

  const admin = createAdminClient();
  const landed: typeof items = [];
  for (const item of items) {
    const slash = item.path.lastIndexOf("/");
    const { data } = await admin.storage
      .from("place-images")
      .list(item.path.slice(0, slash), {
        search: item.path.slice(slash + 1),
        limit: 1,
      });
    const object = data?.find((o) => o.name === item.path.slice(slash + 1));
    if (!object) continue;
    const size = (object.metadata as { size?: number } | null)?.size ?? 0;
    if (size > MAX_ADMIN_MEDIA_BYTES) {
      await admin.storage.from("place-images").remove([item.path]);
      continue;
    }
    landed.push(item);
  }
  if (landed.length === 0) {
    throw new Error("Nothing landed - try the upload again.");
  }

  const { error } = await admin.from("scout_candidate_media").insert(
    landed.map((item) => ({
      candidate_id: candidateId,
      kind: item.kind,
      storage_path: item.path,
    })),
  );
  if (error) throw new Error(error.message);
  revalidatePath("/admin/harvest");
  return { attached: landed.length, skipped: items.length - landed.length };
}

/**
 * Detach one photo, clip or embed from a candidate. Hosted files are deleted
 * from Storage too - a candidate's media is working material, not a record we
 * owe anyone; the takedown-safe retention rules apply to published place_media
 * rows, which approve creates separately.
 */
export async function removeCandidateMedia(mediaId: string) {
  await requireAdmin();
  const id = z.string().uuid().parse(mediaId);
  const admin = createAdminClient();

  const { data: row } = await admin
    .from("scout_candidate_media")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!row) return;

  await admin.from("scout_candidate_media").delete().eq("id", id);
  if (row.storage_path) {
    await admin.storage.from("place-images").remove([row.storage_path]);
  }
  revalidatePath("/admin/harvest");
}

/** Reel/video links attach as embeds - a pointer with attribution, never a copy. */
export async function addCandidateEmbed(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const url = z.string().url().max(500).parse(formData.get("url"));
  const author = z.string().min(1).max(120).parse(formData.get("author"));
  const admin = createAdminClient();
  await admin.from("scout_candidate_media").insert({
    candidate_id: id,
    kind: "embed",
    source_url: url,
    author_name: author,
  });
  revalidatePath("/admin/harvest");
}
