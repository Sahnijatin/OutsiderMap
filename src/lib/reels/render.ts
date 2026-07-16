import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatOutsiderNumber } from "@/lib/identity/username";
import { QUEST_MEDIA_BUCKET } from "@/lib/media/quest";
import {
  buildPosterArgs,
  buildReelArgs,
  defaultFontPath,
  MAX_CLIPS,
  type ReelClip,
} from "@/lib/reels/template";
import type { Database } from "@/types/database";

const execFileAsync = promisify(execFile);
const REEL_BUCKET = "reel-media";

/** Lazy so builds/tests never require the binary package. */
async function ffmpegPath(): Promise<string> {
  const mod = await import("@ffmpeg-installer/ffmpeg");
  return mod.path;
}

/**
 * Render a completed quest's captured media into the member's reel and
 * store it as a pending `reels` row. Runs inside the job route (long
 * maxDuration); throws on any failure so the caller can mark the job.
 */
export async function renderQuestReel(
  admin: SupabaseClient<Database>,
  questId: string,
): Promise<{ reelId: string; videoPath: string }> {
  const { data: quest } = await admin
    .from("quests")
    .select("id, user_id, city, title, status")
    .eq("id", questId)
    .maybeSingle();
  if (!quest) throw new Error("quest not found");
  if (quest.status !== "completed") throw new Error("quest not completed");

  const { data: profile } = await admin
    .from("profiles")
    .select("username, outsider_number")
    .eq("id", quest.user_id)
    .maybeSingle();

  const { data: stops } = await admin
    .from("quest_stops")
    .select("id, position, place_id")
    .eq("quest_id", questId)
    .order("position");
  const stopIds = (stops ?? []).map((s) => s.id);
  if (stopIds.length === 0) throw new Error("quest has no stops");

  const { data: media } = await admin
    .from("quest_stop_media")
    .select("stop_id, storage_path, media_type, created_at")
    .in("stop_id", stopIds)
    .order("created_at");
  if (!media || media.length === 0) throw new Error("no captured media");

  // Clip budget: walk stops in order, round-robin up to MAX_CLIPS so every
  // stop appears even when one was captured heavily.
  const byStop = new Map<string, typeof media>();
  for (const m of media) {
    const list = byStop.get(m.stop_id) ?? [];
    list.push(m);
    byStop.set(m.stop_id, list);
  }
  const ordered: typeof media = [];
  let round = 0;
  while (ordered.length < MAX_CLIPS) {
    let took = false;
    for (const s of stops ?? []) {
      const list = byStop.get(s.id) ?? [];
      if (round < list.length && ordered.length < MAX_CLIPS) {
        ordered.push(list[round]);
        took = true;
      }
    }
    if (!took) break;
    round += 1;
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "reel-"));
  try {
    const ffmpeg = await ffmpegPath();
    const clips: ReelClip[] = [];
    for (let i = 0; i < ordered.length; i++) {
      const m = ordered[i];
      const { data: blob, error } = await admin.storage
        .from(QUEST_MEDIA_BUCKET)
        .download(m.storage_path);
      if (error || !blob) continue; // a missing clip shouldn't kill the reel
      const ext = m.storage_path.slice(m.storage_path.lastIndexOf(".") + 1);
      const localPath = path.join(workDir, `clip-${i}.${ext}`);
      await writeFile(localPath, Buffer.from(await blob.arrayBuffer()));
      // One undecodable file (mislabeled HEIC, truncated upload) must not
      // fail the whole reel: probe-decode a single frame and skip the clip
      // if ffmpeg can't read it.
      try {
        await execFileAsync(
          ffmpeg,
          ["-v", "error", "-i", localPath, "-frames:v", "1", "-f", "null", "-"],
          { maxBuffer: 4 * 1024 * 1024, timeout: 30_000 },
        );
      } catch {
        console.warn(`reel: skipping undecodable clip ${m.storage_path}`);
        continue;
      }
      clips.push({ localPath, type: m.media_type });
    }
    if (clips.length === 0) throw new Error("no downloadable media");

    const watermark = [
      profile?.username ? `@${profile.username}` : null,
      `outsider ${formatOutsiderNumber(profile?.outsider_number)}`,
    ]
      .filter(Boolean)
      .join("   ");

    const outPath = path.join(workDir, "reel.mp4");
    const posterPath = path.join(workDir, "poster.jpg");

    await execFileAsync(
      ffmpeg,
      buildReelArgs({
        clips,
        watermark,
        outPath,
        fontPath: defaultFontPath(),
      }),
      { maxBuffer: 32 * 1024 * 1024, timeout: 600_000 },
    );
    await execFileAsync(ffmpeg, buildPosterArgs(outPath, posterPath), {
      maxBuffer: 8 * 1024 * 1024,
      timeout: 60_000,
    });

    const videoStoragePath = `r/${questId}/${Date.now()}.mp4`;
    const posterStoragePath = videoStoragePath.replace(/\.mp4$/, ".jpg");
    const [video, poster] = await Promise.all([
      readFile(outPath),
      readFile(posterPath),
    ]);
    const { error: upErr } = await admin.storage
      .from(REEL_BUCKET)
      .upload(videoStoragePath, video, { contentType: "video/mp4" });
    if (upErr) throw new Error(`reel upload failed: ${upErr.message}`);
    await admin.storage
      .from(REEL_BUCKET)
      .upload(posterStoragePath, poster, { contentType: "image/jpeg" });

    const approxDuration = clips.reduce(
      (sum, c) => sum + (c.type === "image" ? 2.6 : 3.5),
      0,
    );
    const { data: reel, error: reelErr } = await admin
      .from("reels")
      .insert({
        source: "user_quest",
        user_id: quest.user_id,
        quest_id: quest.id,
        place_id: stops?.[0]?.place_id ?? null,
        city: quest.city,
        video_path: videoStoragePath,
        poster_path: posterStoragePath,
        caption: quest.title,
        duration_seconds: approxDuration,
        status: "pending",
      })
      .select("id")
      .single();
    if (reelErr) throw new Error(reelErr.message);

    return { reelId: reel.id, videoPath: videoStoragePath };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
