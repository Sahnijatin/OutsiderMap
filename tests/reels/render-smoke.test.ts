import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPosterArgs,
  buildReelArgs,
  defaultFontPath,
  type ReelClip,
} from "@/lib/reels/template";

/**
 * Real-render smoke test: generated photos through the actual ffmpeg binary
 * with the actual template args. Needs ffmpeg + sharp on disk, so it only
 * runs when REEL_SMOKE=1 (local/manual) - CI skips it.
 */
describe.runIf(process.env.REEL_SMOKE === "1")("reel render (real ffmpeg)", () => {
  it("renders a watermarked vertical MP4 and a poster", async () => {
    const { default: sharp } = await import("sharp");
    const ffmpeg = (await import("@ffmpeg-installer/ffmpeg")).path;

    const work = mkdtempSync(path.join(tmpdir(), "reel-smoke-"));
    const clips: ReelClip[] = [];
    const colors = ["#8a4b12", "#31506b", "#3f6b31"];
    for (let i = 0; i < colors.length; i++) {
      const p = path.join(work, `shot-${i}.jpg`);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600"><rect width="1200" height="1600" fill="${colors[i]}"/><circle cx="600" cy="800" r="300" fill="#f0a431" opacity="0.5"/></svg>`;
      writeFileSync(p, await sharp(Buffer.from(svg)).jpeg().toBuffer());
      clips.push({ localPath: p, type: "image" });
    }

    const outPath = path.join(work, "reel.mp4");
    const posterPath = path.join(work, "poster.jpg");
    execFileSync(
      ffmpeg,
      buildReelArgs({
        clips,
        watermark: "@sahnijatin   outsider #0001",
        outPath,
        fontPath: defaultFontPath(),
      }),
      { stdio: "pipe", timeout: 120_000 },
    );
    execFileSync(ffmpeg, buildPosterArgs(outPath, posterPath), {
      stdio: "pipe",
      timeout: 30_000,
    });

    expect(statSync(outPath).size).toBeGreaterThan(50_000);
    expect(statSync(posterPath).size).toBeGreaterThan(5_000);
  }, 180_000);
});
