import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Admin · Categories" };

/**
 * Map categories admin: add a category, change its color, reorder the legend.
 * Places point at one (via the place editor); the map pin color + legend read
 * from here.
 */
export default async function CategoriesPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: categories } = await admin
    .from("map_categories")
    .select("id, slug, label, color, sort_order, is_active")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  const list = categories ?? [];

  return (
    <main className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Map categories</h1>
          <p className="mt-1 text-sm text-ink-dim">
            The pin colors and legend. Assign one to a place in the place editor.
          </p>
        </div>
        <ButtonLink href="/admin/categories/new" size="sm">
          New category
        </ButtonLink>
      </header>

      {list.length === 0 ? (
        <Card className="p-6 text-center text-sm text-ink-dim">
          No categories yet.
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((c) => (
            <li key={c.id}>
              <Link href={`/admin/categories/${c.id}`}>
                <Card className="flex items-center gap-3 p-3 transition-colors hover:border-accent/50">
                  <span
                    aria-hidden
                    className="size-4 shrink-0 rounded-full ring-1 ring-black/30"
                    style={{ background: c.color }}
                  />
                  <span className="flex-1 text-sm text-ink">{c.label}</span>
                  <span className="font-mono text-xs text-ink-dim">{c.slug}</span>
                  <span className="font-mono text-xs text-ink-dim">{c.color}</span>
                  {!c.is_active && <Badge variant="outline">hidden</Badge>}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
