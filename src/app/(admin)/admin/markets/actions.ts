"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestMarketIntel } from "@/lib/ingest/market-intel";

/** Mine a public shopping-haul link into a pending price observation (#68). */
export async function mineMarketLink(formData: FormData) {
  await requireAdmin();
  const url = z.string().url().max(500).parse(formData.get("url"));
  const admin = createAdminClient();
  try {
    await ingestMarketIntel(admin, { url });
  } catch (err) {
    // Extraction/resolution can fail on thin metadata; the admin just sees no
    // new pending row rather than an error page.
    console.error("market mine failed", err);
  }
  revalidatePath("/admin/markets");
}

/** Publish a pending price so it starts counting toward the aggregate. */
export async function approvePrice(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const admin = createAdminClient();
  await admin
    .from("price_points")
    .update({ status: "published" })
    .eq("id", id)
    .eq("status", "pending");
  revalidatePath("/admin/markets");
}

/** Reject a pending price - it never enters the aggregate. */
export async function rejectPrice(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const admin = createAdminClient();
  await admin
    .from("price_points")
    .update({ status: "rejected" })
    .eq("id", id)
    .eq("status", "pending");
  revalidatePath("/admin/markets");
}

/** Publish or unpublish a market (controls whether members can find it). */
export async function toggleMarketPublished(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const publish = formData.get("publish") === "true";
  const admin = createAdminClient();
  await admin.from("markets").update({ is_published: publish }).eq("id", id);
  revalidatePath("/admin/markets");
}
