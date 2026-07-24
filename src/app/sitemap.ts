import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sitemap (#116). Published place pages are the anon-viewable, indexable surface
 * now that the map is home, so they carry the SEO. Falls back to the static
 * routes when the service-role key is absent (e.g. preview builds).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://outsidermap.com";

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/map`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.5 },
  ];

  let places: { slug: string; updated_at: string }[] = [];
  try {
    const { data } = await createAdminClient()
      .from("places")
      .select("slug, updated_at")
      .eq("is_published", true)
      .eq("is_chain", false)
      .limit(5000);
    places = data ?? [];
  } catch {
    // No/invalid service-role key - ship the static routes only.
  }

  return [
    ...staticRoutes,
    ...places.map((p) => ({
      url: `${base}/place/${p.slug}`,
      lastModified: p.updated_at,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
