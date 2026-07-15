import "server-only";
import path from "node:path";

/**
 * The "classic" reel template as a pure ffmpeg argument builder: vertical
 * 1080x1920, photos get 2.6s of Ken Burns, videos are trimmed to 3.5s,
 * hard-cut concat, and the member's own badge (@username #0042) as the only
 * watermark. Pure function - tested without running ffmpeg.
 */

export const REEL_W = 1080;
export const REEL_H = 1920;
export const FPS = 30;
export const PHOTO_SECONDS = 2.6;
export const CLIP_SECONDS = 3.5;
export const MAX_CLIPS = 12;

export type ReelClip = {
  /** Absolute local path of the downloaded media file. */
  localPath: string;
  type: "image" | "video";
};

export type ReelSpec = {
  clips: ReelClip[];
  /** e.g. "@sahnijatin  #0001" - rendered bottom-center in Geist Mono. */
  watermark: string;
  outPath: string;
  fontPath: string;
};

/** drawtext needs ':' and '\' and "'" escaped in its text argument. */
export function escapeDrawtext(text: string) {
  return text
    .replaceAll("\\", "\\\\")
    .replaceAll(":", "\\:")
    .replaceAll("'", "\\'")
    .replaceAll("%", "\\%");
}

/** ffmpeg filter args treat these specially in filename options. */
function escapeFilterPath(p: string) {
  return p.replaceAll("\\", "/").replaceAll(":", "\\:").replaceAll("'", "\\'");
}

/**
 * Build the complete ffmpeg argv (without the binary itself) for a spec.
 * Every clip is scaled/cropped to cover 1080x1920; photos animate with a
 * slow push-in; everything concats to one silent H.264 MP4.
 */
export function buildReelArgs(spec: ReelSpec): string[] {
  const clips = spec.clips.slice(0, MAX_CLIPS);
  if (clips.length === 0) throw new Error("reel needs at least one clip");

  const args: string[] = ["-y"];
  for (const clip of clips) {
    if (clip.type === "image") {
      // One decoded frame only - zoompan (d=N below) generates the photo's
      // duration itself. Looping the input here multiplies the frame count
      // per clip and blows the render time up ~65x.
      args.push("-i", clip.localPath);
    } else {
      args.push("-t", String(CLIP_SECONDS), "-i", clip.localPath);
    }
  }

  const cover = `scale=${REEL_W}:${REEL_H}:force_original_aspect_ratio=increase,crop=${REEL_W}:${REEL_H}`;
  const photoFrames = Math.round(PHOTO_SECONDS * FPS);
  const filters: string[] = [];
  for (let i = 0; i < clips.length; i++) {
    if (clips[i].type === "image") {
      // Ken Burns: oversample then a slow centered push-in kills jitter.
      filters.push(
        `[${i}:v]scale=${REEL_W * 2}:${REEL_H * 2}:force_original_aspect_ratio=increase,crop=${REEL_W * 2}:${REEL_H * 2},` +
          `zoompan=z='1+0.08*on/${photoFrames}':d=${photoFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${REEL_W}x${REEL_H}:fps=${FPS},` +
          `setsar=1,format=yuv420p[v${i}]`,
      );
    } else {
      filters.push(
        `[${i}:v]${cover},fps=${FPS},setsar=1,format=yuv420p[v${i}]`,
      );
    }
  }
  const inputs = clips.map((_, i) => `[v${i}]`).join("");
  filters.push(`${inputs}concat=n=${clips.length}:v=1:a=0[cat]`);
  filters.push(
    `[cat]drawtext=fontfile='${escapeFilterPath(spec.fontPath)}':text='${escapeDrawtext(spec.watermark)}':` +
      // letter_spacing needs ffmpeg 5+; the installer ships 4.4 - keep it out.
      `fontcolor=0xede7db@0.85:fontsize=34:` +
      `x=(w-text_w)/2:y=h-140:shadowcolor=0x0c0a08@0.6:shadowx=0:shadowy=2[out]`,
  );

  args.push(
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[out]",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    spec.outPath,
  );
  return args;
}

/** Poster: grab a frame from 1s in. */
export function buildPosterArgs(videoPath: string, posterPath: string) {
  return [
    "-y",
    "-ss",
    "1",
    "-i",
    videoPath,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    posterPath,
  ];
}

/** Repo-relative font, traced into the serverless bundle. */
export function defaultFontPath() {
  return path.join(process.cwd(), "assets", "fonts", "GeistMono-Medium.ttf");
}
