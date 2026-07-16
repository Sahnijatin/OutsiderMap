import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicMediaUrl } from "@/lib/media/url";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  attachManualReel,
  moderateReel,
  retryReelJob,
  uploadCuratedReel,
} from "./actions";

export const metadata: Metadata = { title: "Reels · Admin" };

/**
 * Reel desk: everything pending moderation, plus failed render jobs with a
 * retry and a manual-assembly fallback. Layout-level requireAdmin gates this;
 * actions re-check.
 */
export default async function AdminReelsPage() {
  const admin = createAdminClient();

  const [{ data: pending }, { data: failedJobs }, { data: recent }] =
    await Promise.all([
      admin
        .from("reels")
        .select("id, caption, city, source, video_path, poster_path, created_at, user_id")
        .eq("status", "pending")
        .order("created_at")
        .limit(30),
      admin
        .from("reel_jobs")
        .select("id, quest_id, error, attempts, updated_at, quest:quests(title)")
        .eq("status", "failed")
        .order("updated_at", { ascending: false })
        .limit(20),
      admin
        .from("reels")
        .select("id, caption, status, created_at")
        .neq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="font-display text-2xl italic">Upload curated reel</h2>
        <p className="mt-1 max-w-xl text-sm text-ink-dim">
          The feed&rsquo;s editorial lever: a vertical MP4 goes straight in as
          approved, optionally linked to a place for the &ldquo;Do this&rdquo;
          button.
        </p>
        <form
          action={uploadCuratedReel}
          className="mt-4 grid gap-3 sm:grid-cols-2"
        >
          <input
            name="caption"
            required
            maxLength={140}
            placeholder="Caption, e.g. Thursday qawwali at Nizamuddin"
            className="rounded-card border border-line bg-surface px-4 py-2.5 text-sm text-ink outline-none placeholder:text-ink-dim focus:border-accent/60 sm:col-span-2"
          />
          <input
            name="city"
            required
            defaultValue="delhi"
            placeholder="city slug"
            className="rounded-card border border-line bg-surface px-4 py-2.5 font-mono text-sm text-ink outline-none focus:border-accent/60"
          />
          <input
            name="place_slug"
            placeholder="place slug (optional)"
            className="rounded-card border border-line bg-surface px-4 py-2.5 font-mono text-sm text-ink outline-none placeholder:text-ink-dim focus:border-accent/60"
          />
          <input
            type="file"
            name="video"
            accept="video/mp4"
            required
            className="text-xs text-ink-dim file:mr-2 file:rounded-full file:border file:border-line file:bg-transparent file:px-3 file:py-1.5 file:text-xs file:text-ink sm:col-span-2"
          />
          <div className="sm:col-span-2">
            <Button type="submit" size="sm">
              Publish to the feed
            </Button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="font-display text-2xl italic">
          Pending review ({pending?.length ?? 0})
        </h2>
        {(pending?.length ?? 0) === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">Queue&rsquo;s clear.</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pending!.map((reel) => {
              const video = publicMediaUrl("reel-media", reel.video_path);
              const poster = publicMediaUrl("reel-media", reel.poster_path);
              return (
                <Card key={reel.id} className="flex flex-col gap-3 p-3">
                  {video && (
                    <video
                      src={video}
                      poster={poster ?? undefined}
                      controls
                      playsInline
                      preload="none"
                      className="aspect-[9/16] max-h-72 w-full rounded-lg bg-night object-contain"
                    />
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm">{reel.caption ?? "Untitled"}</p>
                    <Badge>{reel.source}</Badge>
                  </div>
                  <div className="flex gap-2">
                    <form action={moderateReel} className="flex-1">
                      <input type="hidden" name="id" value={reel.id} />
                      <input type="hidden" name="status" value="approved" />
                      <Button type="submit" size="sm" className="w-full">
                        Approve
                      </Button>
                    </form>
                    <form action={moderateReel} className="flex-1">
                      <input type="hidden" name="id" value={reel.id} />
                      <input type="hidden" name="status" value="rejected" />
                      <Button
                        type="submit"
                        size="sm"
                        variant="danger"
                        className="w-full"
                      >
                        Reject
                      </Button>
                    </form>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-2xl italic">
          Failed renders ({failedJobs?.length ?? 0})
        </h2>
        {(failedJobs?.length ?? 0) === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">Nothing broken.</p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {failedJobs!.map((job) => (
              <Card key={job.id} className="flex flex-col gap-3 p-4">
                <div>
                  <p className="text-sm font-medium">
                    {job.quest?.title ?? job.quest_id}
                  </p>
                  <p className="mt-1 font-mono text-xs text-danger">
                    {job.error ?? "unknown error"} · {job.attempts} attempts
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <form action={retryReelJob}>
                    <input type="hidden" name="id" value={job.id} />
                    <Button type="submit" size="sm" variant="secondary">
                      Retry pipeline
                    </Button>
                  </form>
                  <form
                    action={attachManualReel}
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="quest_id" value={job.quest_id} />
                    <input
                      type="file"
                      name="video"
                      accept="video/mp4"
                      required
                      className="text-xs text-ink-dim file:mr-2 file:rounded-full file:border file:border-line file:bg-transparent file:px-3 file:py-1 file:text-xs file:text-ink"
                    />
                    <Button type="submit" size="sm">
                      Attach hand-cut MP4
                    </Button>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-2xl italic">Recently decided</h2>
        <ul className="mt-3 flex flex-col gap-1">
          {(recent ?? []).map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between text-sm text-ink-dim"
            >
              <span className="truncate">{r.caption ?? "Untitled"}</span>
              <Badge variant={r.status === "approved" ? "accent" : "outline"}>
                {r.status}
              </Badge>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
