"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  approveIngestItem,
  detectSourceType,
  processIngestItems,
} from "@/lib/ingest/pipeline";

/** Paste one URL per line into the inbox; each becomes a queued item. */
export async function addIngestUrls(formData: FormData) {
  const profile = await requireAdmin();

  const raw = z.string().max(10_000).parse(formData.get("urls") ?? "");
  const urls = [
    ...new Set(
      raw
        .split(/\s+/)
        .map((u) => u.trim())
        .filter((u) => /^https?:\/\/\S+$/.test(u)),
    ),
  ].slice(0, 50);
  if (urls.length === 0) return;

  const admin = createAdminClient();
  await admin.from("ingest_items").upsert(
    urls.map((url) => ({
      url,
      source_type: detectSourceType(url),
      created_by: profile.id,
    })),
    { onConflict: "url", ignoreDuplicates: true },
  );

  // Start processing right away; the cron sweeper picks up the rest.
  after(async () => {
    try {
      await processIngestItems(admin, 5);
    } catch (err) {
      console.error("ingest processing failed", err);
    }
  });
  revalidatePath("/admin/ingest");
}

export async function approveIngest(formData: FormData) {
  const profile = await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const admin = createAdminClient();
  await approveIngestItem(admin, id, profile.id);
  revalidatePath("/admin/ingest");
  revalidatePath("/admin/places");
}

export async function rejectIngest(formData: FormData) {
  const profile = await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const admin = createAdminClient();
  await admin
    .from("ingest_items")
    .update({
      status: "rejected",
      reviewed_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "needs_review");
  revalidatePath("/admin/ingest");
}

export async function retryIngest(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const admin = createAdminClient();
  await admin
    .from("ingest_items")
    .update({
      status: "queued",
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "failed");
  after(async () => {
    try {
      await processIngestItems(admin, 2);
    } catch (err) {
      console.error("ingest retry failed", err);
    }
  });
  revalidatePath("/admin/ingest");
}
