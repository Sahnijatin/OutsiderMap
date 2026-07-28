"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createHarvestRun, processScoutTasks } from "@/lib/harvest/runner";
import { approveCandidate } from "@/lib/harvest/approve";
import { HARVEST_CATEGORIES, HARVEST_STATES } from "@/lib/harvest/registry";

const RunSchema = z.object({
  state: z.string().refine((s) => s in HARVEST_STATES, "unknown state"),
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
  const { data: runs } = await admin
    .from("scout_runs")
    .select("id, state, cities, categories, status, created_at")
    .order("created_at", { ascending: false })
    .limit(1);
  const run = runs?.[0];
  if (!run) return null;
  const [{ count: total }, { count: done }, { count: failed }, { count: candidates }] =
    await Promise.all([
      admin.from("scout_tasks").select("id", { count: "exact", head: true }).eq("run_id", run.id),
      admin.from("scout_tasks").select("id", { count: "exact", head: true }).eq("run_id", run.id).eq("status", "done"),
      admin.from("scout_tasks").select("id", { count: "exact", head: true }).eq("run_id", run.id).eq("status", "failed"),
      admin.from("scout_candidates").select("id", { count: "exact", head: true }).eq("run_id", run.id),
    ]);
  return {
    runId: run.id,
    status: run.status,
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
