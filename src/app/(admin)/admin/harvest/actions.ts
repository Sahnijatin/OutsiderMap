"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
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

/** Photo upload for a candidate - editorial media we hold a licence to. */
export async function uploadCandidatePhoto(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return;
  if (file.size > 8 * 1024 * 1024) throw new Error("Photo too large (8MB max).");
  if (!/^image\//.test(file.type)) throw new Error("Not an image.");

  const admin = createAdminClient();
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().slice(0, 5);
  const path = `harvest/${id}/${randomUUID()}.${ext}`;
  const { error } = await admin.storage
    .from("place-images")
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: false,
    });
  if (error) throw new Error(error.message);
  await admin.from("scout_candidate_media").insert({
    candidate_id: id,
    kind: "image",
    storage_path: path,
  });
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
