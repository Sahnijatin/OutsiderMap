"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

/** Update the member's own bio, shown on their public profile. */
export async function updateBio(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const raw = String(formData.get("bio") ?? "").trim().slice(0, 200);
  const { error } = await supabase
    .from("profiles")
    .update({ bio: raw || null })
    .eq("id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/profile");
}

/** Opt the member's shareable taste card in or out of being publicly viewable. */
export async function setTasteCardPublic(isPublic: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_taste_card_public", {
    p_public: isPublic,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/profile");
}
