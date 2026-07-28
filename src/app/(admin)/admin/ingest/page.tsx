import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { CandidateSchema, type DedupeMatch } from "@/lib/ingest/pipeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  addIngestUrls,
  approveIngest,
  rejectIngest,
  retryIngest,
} from "./actions";

export const metadata: Metadata = { title: "Ingest · Admin" };

/**
 * The scout inbox: paste public links, review what the pipeline extracted
 * next to any likely duplicates, approve into the catalog (unpublished,
 * source: ingested) or reject.
 */
export default async function AdminIngestPage() {
  // Defense in depth: the layout already gates rendering, but every admin
  // page that touches the service role double-checks (house convention).
  await requireAdmin();

  const admin = createAdminClient();

  const [{ data: review }, { data: inflight }, { data: failed }] =
    await Promise.all([
      admin
        .from("ingest_items")
        .select("id, url, source_type, candidate, dedupe_matches, raw_metadata, created_at")
        .eq("status", "needs_review")
        .order("created_at")
        .limit(30),
      admin
        .from("ingest_items")
        .select("id, url, status")
        .in("status", ["queued", "fetching", "extracted"])
        .order("created_at")
        .limit(20),
      admin
        .from("ingest_items")
        .select("id, url, error")
        .eq("status", "failed")
        .order("updated_at", { ascending: false })
        .limit(10),
    ]);

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="font-display text-2xl italic">Feed the map</h2>
        <p className="mt-1 max-w-xl text-sm text-ink-dim">
          Paste public links - reels, videos, blog posts - one per line. The
          pipeline reads public metadata, drafts a catalog entry, and checks
          for duplicates. Nothing publishes without you.
        </p>
        <form action={addIngestUrls} className="mt-4 flex flex-col gap-3">
          <textarea
            name="urls"
            rows={4}
            required
            placeholder={"https://www.instagram.com/reel/...\nhttps://youtu.be/..."}
            className="w-full rounded-card border border-line bg-surface p-4 font-mono text-xs text-ink outline-none placeholder:text-ink-dim focus:border-accent/60"
          />
          <div>
            <Button type="submit" size="sm">
              Queue for extraction
            </Button>
          </div>
        </form>
        {(inflight?.length ?? 0) > 0 && (
          <p className="mt-3 text-xs text-ink-dim">
            {inflight!.length} in flight:{" "}
            {inflight!.map((i) => i.status).join(", ")}
          </p>
        )}
      </section>

      <section>
        <h2 className="font-display text-2xl italic">
          Needs review ({review?.length ?? 0})
        </h2>
        {(review?.length ?? 0) === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">Inbox zero.</p>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            {review!.map((item) => {
              const parsed = CandidateSchema.safeParse(item.candidate);
              const candidate = parsed.success ? parsed.data : null;
              const dupes = (item.dedupe_matches ?? []) as DedupeMatch[];
              // Street-submission context (member's own words) + canonical
              // Places API data, when the metadata carries them.
              const meta = (
                item.raw_metadata && typeof item.raw_metadata === "object" && !Array.isArray(item.raw_metadata)
                  ? item.raw_metadata
                  : {}
              ) as Record<string, unknown>;
              const google = (
                meta.google && typeof meta.google === "object" && !Array.isArray(meta.google)
                  ? meta.google
                  : null
              ) as Record<string, unknown> | null;
              return (
                <Card key={item.id} className="flex flex-col gap-3 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate font-mono text-xs text-ink-dim underline"
                    >
                      {item.url}
                    </a>
                    <Badge>{item.source_type}</Badge>
                  </div>

                  {meta.member_submission === true && (
                    <p className="rounded-card border border-accent/30 bg-accent/5 px-3 py-2 text-sm">
                      <span className="voice">street submission</span>{" "}
                      {typeof meta.member_name === "string" && (
                        <span className="font-medium">{meta.member_name}</span>
                      )}
                      {typeof meta.member_comment === "string" && (
                        <span className="text-ink-dim">
                          {" "}
                          - &ldquo;{meta.member_comment}&rdquo;
                        </span>
                      )}
                    </p>
                  )}
                  {google && (
                    <p className="text-xs text-ink-dim">
                      Google:{" "}
                      {[
                        typeof google.name === "string" ? google.name : null,
                        typeof google.rating === "number"
                          ? `${google.rating}★ (${google.review_count ?? "?"} reviews)`
                          : null,
                        typeof google.address === "string" ? google.address : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}

                  {candidate ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="font-display text-lg italic">
                          {candidate.name}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-dim">
                          {[candidate.kind, candidate.area, candidate.city]
                            .filter(Boolean)
                            .join(" · ")}
                          {candidate.price_hint
                            ? ` · ${"₹".repeat(candidate.price_hint)}`
                            : ""}
                        </p>
                        <p className="mt-2 text-sm text-ink-dim">
                          {candidate.description}
                        </p>
                        <p className="mt-2 border-l-2 border-accent/60 pl-2 text-sm italic">
                          {candidate.why_special}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {candidate.vibe_tags.map((v) => (
                            <Badge key={v}>{v}</Badge>
                          ))}
                          <Badge
                            variant={
                              candidate.confidence === "high"
                                ? "accent"
                                : "outline"
                            }
                          >
                            confidence: {candidate.confidence}
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <p className="voice">possible duplicates</p>
                        {dupes.length === 0 ? (
                          <p className="mt-2 text-sm text-ink-dim">
                            None found - looks new.
                          </p>
                        ) : (
                          <ul className="mt-2 flex flex-col gap-1.5">
                            {dupes.map((d) => (
                              <li
                                key={d.slug}
                                className="flex items-center justify-between gap-2 text-sm"
                              >
                                <span className="truncate">
                                  {d.name}
                                  {d.area ? ` · ${d.area}` : ""}
                                </span>
                                <span className="shrink-0 font-mono text-xs text-danger">
                                  {d.reason} {d.similarity}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-danger">
                      Candidate didn&rsquo;t parse - reject and re-queue.
                    </p>
                  )}

                  <div className="flex gap-2">
                    <form action={approveIngest}>
                      <input type="hidden" name="id" value={item.id} />
                      <Button type="submit" size="sm" disabled={!candidate}>
                        Approve → draft place
                      </Button>
                    </form>
                    <form action={rejectIngest}>
                      <input type="hidden" name="id" value={item.id} />
                      <Button type="submit" size="sm" variant="danger">
                        Reject
                      </Button>
                    </form>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-xs text-ink-dim">
          Approved candidates land in{" "}
          <Link href="/admin/places" className="underline">
            Places
          </Link>{" "}
          unpublished - add photos and hours there, then publish.
        </p>
      </section>

      {(failed?.length ?? 0) > 0 && (
        <section>
          <h2 className="font-display text-2xl italic">
            Failed ({failed!.length})
          </h2>
          <div className="mt-3 flex flex-col gap-2">
            {failed!.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-card border border-line p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs">{item.url}</p>
                  <p className="mt-0.5 truncate text-xs text-danger">
                    {item.error}
                  </p>
                </div>
                <form action={retryIngest}>
                  <input type="hidden" name="id" value={item.id} />
                  <Button type="submit" size="sm" variant="secondary">
                    Retry
                  </Button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
