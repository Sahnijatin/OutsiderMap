import { describe, expect, it } from "vitest";
import {
  buildPosterArgs,
  buildReelArgs,
  escapeDrawtext,
  MAX_CLIPS,
  PHOTO_SECONDS,
  type ReelClip,
} from "@/lib/reels/template";

const photo = (n: number): ReelClip => ({
  localPath: `/tmp/p${n}.jpg`,
  type: "image",
});
const video = (n: number): ReelClip => ({
  localPath: `/tmp/v${n}.mp4`,
  type: "video",
});

const base = {
  watermark: "@sahnijatin   outsider #0001",
  outPath: "/tmp/out.mp4",
  fontPath: "/repo/assets/fonts/GeistMono-Medium.ttf",
};

describe("buildReelArgs", () => {
  it("rejects an empty clip list", () => {
    expect(() => buildReelArgs({ ...base, clips: [] })).toThrow();
  });

  it("feeds photos once (zoompan makes the duration) and trims videos", () => {
    const args = buildReelArgs({ ...base, clips: [photo(1), video(1)] });
    const joined = args.join(" ");
    // No -loop: zoompan d=N generates the photo's frames itself.
    expect(joined).not.toContain("-loop");
    expect(joined).toContain("-i /tmp/p1.jpg");
    expect(joined).toContain("-t 3.5 -i /tmp/v1.mp4");
    const filter = args[args.indexOf("-filter_complex") + 1];
    expect(filter).toContain(`zoompan`);
    expect(filter).toContain(`d=${Math.round(PHOTO_SECONDS * 30)}`);
    expect(filter).toContain("concat=n=2:v=1:a=0");
  });

  it("caps the clip count", () => {
    const clips = Array.from({ length: MAX_CLIPS + 5 }, (_, i) => photo(i));
    const args = buildReelArgs({ ...base, clips });
    const filter = args[args.indexOf("-filter_complex") + 1];
    expect(filter).toContain(`concat=n=${MAX_CLIPS}:`);
  });

  it("watermarks with the member badge and no branding", () => {
    const args = buildReelArgs({ ...base, clips: [photo(1)] });
    const filter = args[args.indexOf("-filter_complex") + 1];
    expect(filter).toContain("drawtext");
    expect(filter).toContain("@sahnijatin");
    expect(filter).toContain("outsider");
    expect(filter.toLowerCase()).not.toContain("outsidermap");
  });

  it("produces a silent, streamable H.264 vertical", () => {
    const args = buildReelArgs({ ...base, clips: [video(1)] });
    expect(args).toContain("-an");
    expect(args).toContain("libx264");
    expect(args).toContain("+faststart");
    expect(args[args.length - 1]).toBe("/tmp/out.mp4");
  });
});

describe("escapeDrawtext", () => {
  it("escapes ffmpeg-reserved characters", () => {
    expect(escapeDrawtext("a:b'c%d")).toBe("a\\:b\\'c\\%d");
  });
});

describe("buildPosterArgs", () => {
  it("grabs one early frame", () => {
    const args = buildPosterArgs("/tmp/out.mp4", "/tmp/poster.jpg");
    expect(args.join(" ")).toContain("-ss 1 -i /tmp/out.mp4 -frames:v 1");
  });
});
