/**
 * Dev-only: render the branded experience covers locally for preview (the live
 * seed generates + uploads the same art inline). Writes PNGs you can eyeball:
 *
 *   npm install sharp --no-save
 *   node scripts/gen-experience-covers.mjs
 *
 * Output: scratch/experience-covers/<slug>.png (gitignored).
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

/** Deterministic on-brand cover: amber halo + scattered lights on night. */
function coverSvg(slug) {
  let h = 0;
  for (let i = 0; i < slug.length; i += 1) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  const W = 1200, H = 800, cx = W / 2, cy = H / 2;
  const accent = h % 2 === 0 ? "#f0a431" : "#c87c1f";
  const dots = Array.from({ length: 30 }, () => {
    h = (h * 1103515245 + 12345) >>> 0;
    const a = ((h % 1000) / 1000) * Math.PI * 2;
    const r = 80 + (h % 360);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * 0.66;
    const rad = 2 + (h % 5);
    const op = (0.15 + (h % 6) * 0.08).toFixed(2);
    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${rad}" fill="${accent}" opacity="${op}"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#0c0a08"/>
    <defs><radialGradient id="g" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.42"/>
      <stop offset="55%" stop-color="${accent}" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient></defs>
    <ellipse cx="${cx}" cy="${cy}" rx="${W * 0.5}" ry="${H * 0.5}" fill="url(#g)"/>
    ${dots}
    <circle cx="${cx}" cy="${cy}" r="20" fill="${accent}"/>
  </svg>`;
}

const root = path.dirname(fileURLToPath(import.meta.url));
const experiences = JSON.parse(
  await readFile(path.join(root, "..", "data", "experiences.delhi.json"), "utf8"),
);
const outDir = path.join(root, "..", "scratch", "experience-covers");
await mkdir(outDir, { recursive: true });

for (const x of experiences) {
  const buf = await sharp(Buffer.from(coverSvg(x.slug))).png().toBuffer();
  await writeFile(path.join(outDir, `${x.slug}.png`), buf);
  console.log(`  ${x.slug}.png`);
}
console.log(`Done - ${experiences.length} covers in scratch/experience-covers/`);
