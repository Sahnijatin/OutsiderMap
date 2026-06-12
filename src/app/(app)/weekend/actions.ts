"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { isPremium, requireUser } from "@/lib/auth";
import {
  generateWeekendPlan,
  nextFriday,
  StoredItemsSchema,
} from "@/lib/plans/weekend";
import { createClient } from "@/lib/supabase/server";

async function requirePremiumUser() {
  const user = await requireUser();
  if (!(await isPremium())) redirect("/pricing");
  return user;
}

const CreateSchema = z.object({
  brief: z.string().trim().max(500).optional(),
  budgetMax: z.coerce.number().int().min(1).max(4).optional(),
  weekendStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export async function createPlan(formData: FormData) {
  const user = await requirePremiumUser();
  const input = CreateSchema.parse({
    brief: (formData.get("brief") as string) || undefined,
    budgetMax: (formData.get("budget") as string) || undefined,
    weekendStart: (formData.get("weekend_start") as string) || undefined,
  });

  const { planId, items } = await generateWeekendPlan(user.id, {
    weekendStart: input.weekendStart ?? nextFriday(),
    brief: input.brief,
    budgetMax: input.budgetMax,
  });

  // Each planned place is a taste signal.
  after(async () => {
    const supabase = await createClient();
    await supabase.from("interaction_events").insert({
      user_id: user.id,
      event_type: "plan_add",
      payload: { plan_id: planId, slugs: items.map((i) => i.place_slug) },
    });
  });

  redirect(`/weekend/${planId}`);
}

/** Loads a plan's items after verifying ownership via RLS-scoped select. */
async function loadPlan(planId: string) {
  const supabase = await createClient();
  const { data: plan } = await supabase
    .from("weekend_plans")
    .select("id, items")
    .eq("id", planId)
    .maybeSingle();
  if (!plan) throw new Error("Plan not found");
  return { supabase, items: StoredItemsSchema.parse(plan.items) };
}

export async function removeItem(planId: string, index: number) {
  await requireUser();
  const { supabase, items } = await loadPlan(planId);
  items.splice(index, 1);
  await supabase
    .from("weekend_plans")
    .update({ items, updated_at: new Date().toISOString() })
    .eq("id", planId);
  revalidatePath(`/weekend/${planId}`);
}

export async function moveItem(planId: string, index: number, dir: -1 | 1) {
  await requireUser();
  const { supabase, items } = await loadPlan(planId);
  const target = index + dir;
  // Only reorder within the same day — days are a fixed arc.
  if (
    index < 0 ||
    index >= items.length ||
    target < 0 ||
    target >= items.length ||
    items[index].day !== items[target].day
  ) {
    return;
  }
  [items[index], items[target]] = [items[target], items[index]];
  await supabase
    .from("weekend_plans")
    .update({ items, updated_at: new Date().toISOString() })
    .eq("id", planId);
  revalidatePath(`/weekend/${planId}`);
}

export async function setPlanStatus(planId: string, status: "draft" | "final") {
  await requireUser();
  const supabase = await createClient();
  await supabase
    .from("weekend_plans")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", planId);
  revalidatePath(`/weekend/${planId}`);
}

export async function deletePlan(planId: string) {
  await requireUser();
  const supabase = await createClient();
  await supabase.from("weekend_plans").delete().eq("id", planId);
  redirect("/weekend");
}
