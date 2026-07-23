"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
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
