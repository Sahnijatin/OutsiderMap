import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  approvePrice,
  mineMarketLink,
  rejectPrice,
  toggleMarketPublished,
} from "./actions";

export const metadata: Metadata = { title: "Markets · Admin" };

const SOURCE_VARIANT = {
  user_report: "accent",
  content_mined: "outline",
  authored: "default",
} as const;

function ageLabel(iso: string | null): string {
  if (!iso) return "undated";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  return `${Math.floor(days / 30)} mo ago`;
}

/**
 * The market-intelligence desk (#68): mine public hauls into pending prices,
 * review pending prices (published prices feed the aggregate; nothing counts
 * until reviewed), and publish/unpublish markets.
 */
export default async function AdminMarketsPage() {
  // Defense in depth: the layout already gates rendering, but every admin
  // page that touches the service role double-checks (house convention).
  await requireAdmin();

  const admin = createAdminClient();

  const [{ data: markets }, { data: pending }] = await Promise.all([
    admin
      .from("markets")
      .select("id, slug, name, area, categories, is_published")
      .order("name"),
    admin
      .from("price_points")
      .select("id, market_id, category, item, price, source, confidence, observed_at, source_ref")
      .eq("status", "pending")
      .order("observed_at", { ascending: false, nullsFirst: false })
      .limit(60),
  ]);

  const marketName = new Map((markets ?? []).map((m) => [m.id, m.name]));

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="font-display text-2xl italic">Mine a shopping haul</h2>
        <p className="mt-1 max-w-xl text-sm text-ink-dim">
          Paste a public haul link (reel, video, blog). We read public metadata,
          extract a price observation, and stage it below for review. Content
          mining never names a shop - it only ever corroborates a price band.
        </p>
        <form action={mineMarketLink} className="mt-4 flex items-center gap-2">
          <input
            name="url"
            type="url"
            required
            placeholder="https://www.instagram.com/reel/..."
            className="w-full max-w-xl rounded-full border border-line bg-surface px-4 py-2 font-mono text-xs text-ink outline-none placeholder:text-ink-dim focus:border-accent/60"
          />
          <Button type="submit" size="sm">
            Mine
          </Button>
        </form>
      </section>

      <section>
        <h2 className="font-display text-2xl italic">
          Prices needing review ({pending?.length ?? 0})
        </h2>
        <p className="mt-1 max-w-xl text-sm text-ink-dim">
          Mined captions and member reports land here. Publish to let a price
          feed the aggregate; reject to drop it. A single price can never assert
          a shop or an exact number on its own.
        </p>
        {(pending?.length ?? 0) === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">Nothing pending.</p>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {pending!.map((p) => (
              <Card
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate">
                    <span className="font-display italic">
                      {marketName.get(p.market_id) ?? "unknown market"}
                    </span>
                    <span className="text-ink-dim">
                      {" · "}
                      {p.category ?? "uncategorised"}
                      {p.item ? ` · ${p.item}` : ""}
                    </span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-dim">
                    <span className="tabular-nums text-ink">
                      {p.price != null ? `₹${p.price}` : "no price"}
                    </span>
                    <Badge variant={SOURCE_VARIANT[p.source] ?? "default"}>
                      {p.source.replace("_", " ")}
                    </Badge>
                    <span>conf {p.confidence.toFixed(2)}</span>
                    <span>· {ageLabel(p.observed_at)}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <form action={approvePrice}>
                    <input type="hidden" name="id" value={p.id} />
                    <Button type="submit" size="sm" disabled={p.price == null}>
                      Publish
                    </Button>
                  </form>
                  <form action={rejectPrice}>
                    <input type="hidden" name="id" value={p.id} />
                    <Button type="submit" size="sm" variant="danger">
                      Reject
                    </Button>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-2xl italic">
          Markets ({markets?.length ?? 0})
        </h2>
        <p className="mt-1 max-w-xl text-sm text-ink-dim">
          Published markets are findable in chat. Author lanes, guides and the
          seed price pass via <code className="text-xs">npm run seed:markets</code>.
        </p>
        {(markets?.length ?? 0) === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">
            No markets yet - run the seed.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {markets!.map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line/60 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate">
                    <span className="font-display italic">{m.name}</span>
                    {m.area ? (
                      <span className="text-xs text-ink-dim"> · {m.area}</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-ink-dim">
                    {m.categories.length
                      ? m.categories.join(", ")
                      : "no categories"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={m.is_published ? "accent" : "outline"}>
                    {m.is_published ? "published" : "draft"}
                  </Badge>
                  <form action={toggleMarketPublished}>
                    <input type="hidden" name="id" value={m.id} />
                    <input
                      type="hidden"
                      name="publish"
                      value={m.is_published ? "false" : "true"}
                    />
                    <Button type="submit" size="sm" variant="secondary">
                      {m.is_published ? "Unpublish" : "Publish"}
                    </Button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
