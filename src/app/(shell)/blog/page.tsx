import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BlogComposer } from "./blog-composer";

export const metadata: Metadata = { title: "Write a blog · OutsiderMap" };

/**
 * The Blog tab: writing a long-form piece about a place.
 *
 * It is a top-level destination rather than something behind the feed's
 * composer - a member should reach it in one tap. Separate from /compose
 * because a blog needs a title, an ordered block body and a required place
 * anchor; the quick composer is for a line and a photo.
 *
 * `?place=<slug>` pre-fills the anchor, so "write about this place" from a
 * place page lands with the hard part already done.
 */
export default async function NewBlogPage({
  searchParams,
}: {
  searchParams: Promise<{ place?: string }>;
}) {
  const profile = await requireOnboarded();
  const { place: placeSlug } = await searchParams;

  let anchor: { id: string; label: string } | null = null;
  if (placeSlug) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("places")
      .select("id, name, area")
      .eq("slug", placeSlug)
      .eq("is_published", true)
      .maybeSingle();
    if (data) {
      anchor = {
        id: data.id,
        label: [data.name, data.area].filter(Boolean).join(" · "),
      };
    }
  }

  return (
    <BlogComposer homeCity={profile.home_city ?? "delhi"} anchor={anchor} />
  );
}
