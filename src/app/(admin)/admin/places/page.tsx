import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { priceGlyph } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Admin · Places",
};

export default async function AdminPlacesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireAdmin();
  const { filter } = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from("places")
    .select("id, slug, name, area, category, price_level, is_published, source, embedding")
    .order("updated_at", { ascending: false })
    .limit(300);
  if (filter === "published") query = query.eq("is_published", true);
  if (filter === "draft") query = query.eq("is_published", false);
  const { data: places } = await query;

  const filters = [
    { key: undefined, label: "All" },
    { key: "published", label: "Published" },
    { key: "draft", label: "Drafts" },
  ];

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl">Places</h1>
        <ButtonLink href="/admin/places/new" size="sm">
          New place
        </ButtonLink>
      </header>

      <div className="flex gap-2">
        {filters.map((f) => (
          <Link
            key={f.label}
            href={f.key ? `/admin/places?filter=${f.key}` : "/admin/places"}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
              filter === f.key
                ? "border-accent text-accent"
                : "border-line text-ink-dim hover:text-ink"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <ul className="flex flex-col gap-2">
        {(places ?? []).map((place) => (
          <li key={place.id}>
            <Link
              href={`/admin/places/${place.id}`}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 transition-colors hover:border-ink-dim"
            >
              <span className="font-medium">{place.name}</span>
              <span className="text-sm text-ink-dim">
                {[place.area, place.category, priceGlyph(place.price_level)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span className="ml-auto flex items-center gap-2">
                {place.source === "submitted" && (
                  <Badge variant="outline">submitted</Badge>
                )}
                {!place.embedding && <Badge variant="outline">no embedding</Badge>}
                <Badge variant={place.is_published ? "accent" : "default"}>
                  {place.is_published ? "live" : "draft"}
                </Badge>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
