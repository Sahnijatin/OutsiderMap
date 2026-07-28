import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { priceGlyph } from "@/lib/utils";
import { catalogInventory, PUBLISH_BATCH } from "@/lib/catalog/inventory";
import {
  bulkPublishPlaces,
  bulkUnpublishPlaces,
  publishReadyDrafts,
} from "./actions";
import { SelectAllCheckbox } from "./select-all";

export const metadata: Metadata = {
  title: "Admin · Places",
};

const PAGE_SIZE = 50;

const STATUS_OPTIONS = [
  { key: "all", label: "All" },
  { key: "published", label: "Published" },
  { key: "draft", label: "Drafts" },
] as const;

// "curated" is what the schema calls hand-seeded rows (places.source check
// constraint, migration 0014).
const SOURCE_OPTIONS = [
  { key: "all", label: "Any source" },
  { key: "curated", label: "Curated" },
  { key: "ingested", label: "Ingested" },
  { key: "submitted", label: "Submitted" },
] as const;

const NEEDS_OPTIONS = [
  { key: "any", label: "Anything" },
  { key: "no-embedding", label: "No embedding" },
  { key: "no-image", label: "No image" },
  { key: "no-description", label: "No description" },
] as const;

type StatusKey = (typeof STATUS_OPTIONS)[number]["key"];
type SourceKey = (typeof SOURCE_OPTIONS)[number]["key"];
type NeedsKey = (typeof NEEDS_OPTIONS)[number]["key"];

type Filters = {
  q: string;
  status: StatusKey;
  source: SourceKey;
  needs: NeedsKey;
};

/** Escape ilike wildcards and the or() separator. */
function escapeQuery(q: string) {
  return q.replace(/[%_,()]/g, "").trim();
}

function pick<T extends string>(
  raw: string | undefined,
  allowed: readonly { key: T }[],
  fallback: T,
): T {
  return allowed.some((o) => o.key === raw) ? (raw as T) : fallback;
}

/**
 * The draft triage queue. ~6,100 imported drafts flow through here, so this
 * page is built for volume: search, filters, 50-a-page pagination, and bulk
 * publish/unpublish. It deliberately never selects the `embedding` column
 * (300 rows x 1536 floats in the RSC payload, to render a badge) - the
 * "no embedding" badge comes from a separate id-only query instead.
 */
export default async function AdminPlacesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    source?: string;
    needs?: string;
    page?: string;
    notice?: string;
  }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const filters: Filters = {
    q: escapeQuery(params.q ?? ""),
    status: pick(params.status, STATUS_OPTIONS, "all"),
    source: pick(params.source, SOURCE_OPTIONS, "all"),
    needs: pick(params.needs, NEEDS_OPTIONS, "any"),
  };
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const notice = (params.notice ?? "").slice(0, 300);

  const admin = createAdminClient();

  // Everything the current view filters on, minus status - reused for the row
  // query and for the per-status counts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyFilters<T extends { eq: any; is: any; not: any; or: any }>(
    query: T,
    status: StatusKey,
  ): T {
    let q = query;
    if (status === "published") q = q.eq("is_published", true);
    if (status === "draft") q = q.eq("is_published", false);
    if (filters.source !== "all") q = q.eq("source", filters.source);
    if (filters.needs === "no-embedding") q = q.is("embedding", null);
    if (filters.needs === "no-image") q = q.is("image_path", null);
    if (filters.needs === "no-description") q = q.is("description", null);
    if (filters.q) {
      q = q.or(
        `name.ilike.%${filters.q}%,slug.ilike.%${filters.q}%,area.ilike.%${filters.q}%`,
      );
    }
    return q;
  }

  const [{ data: places, count }, publishedCount, draftCount, inventory] =
    await Promise.all([
      applyFilters(
        admin
          .from("places")
          .select(
            "id, slug, name, area, category, price_level, is_published, source, image_path, description",
            { count: "exact" },
          ),
        filters.status,
      )
        .order("updated_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1),
      applyFilters(
        admin.from("places").select("id", { count: "exact", head: true }),
        "published",
      ),
      applyFilters(
        admin.from("places").select("id", { count: "exact", head: true }),
        "draft",
      ),
      // Deliberately ignores the current filter: this is the size of the whole
      // queue, not of the view. "Publish 150 of 1,847 ready" has to mean the
      // same thing regardless of what someone typed in the search box.
      catalogInventory(admin).catch(() => null),
    ]);

  const rows = places ?? [];

  // The "no embedding" badge, without ever shipping a vector: an id-only
  // probe against just this page's rows.
  const noEmbedding = new Set<string>();
  if (rows.length > 0) {
    const { data: missing } = await admin
      .from("places")
      .select("id")
      .in(
        "id",
        rows.map((r) => r.id),
      )
      .is("embedding", null);
    for (const r of missing ?? []) noEmbedding.add(r.id);
  }

  const total = count ?? 0;
  const published = publishedCount.count ?? 0;
  const drafts = draftCount.count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const href = (overrides: Partial<Filters> & { page?: number }) => {
    const next = { ...filters, ...overrides };
    const sp = new URLSearchParams();
    if (next.q) sp.set("q", next.q);
    if (next.status !== "all") sp.set("status", next.status);
    if (next.source !== "all") sp.set("source", next.source);
    if (next.needs !== "any") sp.set("needs", next.needs);
    if (overrides.page && overrides.page > 1)
      sp.set("page", String(overrides.page));
    const qs = sp.toString();
    return qs ? `/admin/places?${qs}` : "/admin/places";
  };
  const currentPath = href({ page });

  const statusCounts: Record<StatusKey, number> = {
    all: published + drafts,
    published,
    draft: drafts,
  };

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Places</h1>
          <p className="mt-1 text-sm text-ink-dim">
            {total.toLocaleString()} match ({published.toLocaleString()}{" "}
            published, {drafts.toLocaleString()} drafts) · page {page} of{" "}
            {lastPage}
          </p>
        </div>
        <ButtonLink href="/admin/places/new" size="sm">
          New place
        </ButtonLink>
      </header>

      {notice && (
        <p className="rounded-card border border-line bg-surface px-4 py-3 text-sm text-ink">
          {notice}
        </p>
      )}

      <form action="/admin/places" className="flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={filters.q}
          placeholder="name, slug or area"
          className="rounded-card border border-line bg-surface px-4 py-2 text-sm text-ink outline-none placeholder:text-ink-dim focus:border-accent/60"
        />
        <select
          name="status"
          defaultValue={filters.status}
          className="rounded-card border border-line bg-surface px-3 py-2 text-sm text-ink"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          name="source"
          defaultValue={filters.source}
          className="rounded-card border border-line bg-surface px-3 py-2 text-sm text-ink"
        >
          {SOURCE_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          name="needs"
          defaultValue={filters.needs}
          className="rounded-card border border-line bg-surface px-3 py-2 text-sm text-ink"
        >
          {NEEDS_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-full border border-line px-4 py-2 text-sm text-ink-dim transition-colors hover:text-ink"
        >
          Filter
        </button>
      </form>

      <div className="flex gap-2">
        {STATUS_OPTIONS.map((o) => (
          <Link
            key={o.key}
            href={href({ status: o.key })}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
              filters.status === o.key
                ? "border-accent text-accent"
                : "border-line text-ink-dim hover:text-ink"
            }`}
          >
            {o.label} · {statusCounts[o.key].toLocaleString()}
          </Link>
        ))}
      </div>

      <form className="flex flex-col gap-3">
        <input type="hidden" name="return_to" value={currentPath} />
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-4 py-2.5">
          <label className="flex items-center gap-2 text-sm text-ink-dim">
            <SelectAllCheckbox />
            Select page
          </label>
          <div className="ml-auto flex gap-2">
            {/*
              The backlog button, shown only when there is a backlog. The
              checkbox flow above tops out at one 50-row page, which is the
              right tool for triaging a few and useless against the thousands
              of drafts that actually cap what chat can retrieve. Readiness is
              re-checked per row inside the action, so this can only ever
              publish places that would pass the bar one at a time.
            */}
            {inventory && inventory.readyDrafts > 0 && (
              <Button formAction={publishReadyDrafts} size="sm" variant="primary">
                Publish{" "}
                {Math.min(PUBLISH_BATCH, inventory.readyDrafts).toLocaleString()}{" "}
                of {inventory.readyDrafts.toLocaleString()} ready
              </Button>
            )}
            <Button formAction={bulkPublishPlaces} size="sm" variant="secondary">
              Publish selected
            </Button>
            <Button
              formAction={bulkUnpublishPlaces}
              size="sm"
              variant="secondary"
            >
              Unpublish selected
            </Button>
          </div>
        </div>

        <ul className="flex flex-col gap-2">
          {rows.map((place) => (
            <li
              key={place.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3"
            >
              <input
                type="checkbox"
                name="ids"
                value={place.id}
                aria-label={`Select ${place.name}`}
                className="size-4 accent-accent"
              />
              <Link
                href={`/admin/places/${place.id}`}
                className="flex min-w-0 flex-1 flex-wrap items-center gap-3 transition-colors hover:text-accent"
              >
                <span className="font-medium">{place.name}</span>
                <span className="text-sm text-ink-dim">
                  {[place.area, place.category, priceGlyph(place.price_level)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Link>
              <span className="ml-auto flex items-center gap-2">
                {place.source === "submitted" && (
                  <Badge variant="outline">submitted</Badge>
                )}
                {!place.description && (
                  <Badge variant="outline">no description</Badge>
                )}
                {!place.image_path && <Badge variant="outline">no image</Badge>}
                {noEmbedding.has(place.id) && (
                  <Badge variant="outline">no embedding</Badge>
                )}
                <Badge variant={place.is_published ? "accent" : "default"}>
                  {place.is_published ? "live" : "draft"}
                </Badge>
              </span>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="rounded-lg border border-line bg-surface px-4 py-8 text-center text-sm text-ink-dim">
              Nothing matches these filters.
            </li>
          )}
        </ul>
      </form>

      <div className="flex items-center gap-3">
        {page > 1 && (
          <Link
            href={href({ page: page - 1 })}
            className="rounded-full border border-line px-4 py-1.5 text-sm text-ink-dim transition-colors hover:text-ink"
          >
            ← Newer
          </Link>
        )}
        {page < lastPage && (
          <Link
            href={href({ page: page + 1 })}
            className="rounded-full border border-line px-4 py-1.5 text-sm text-ink-dim transition-colors hover:text-ink"
          >
            Older →
          </Link>
        )}
      </div>
    </main>
  );
}
