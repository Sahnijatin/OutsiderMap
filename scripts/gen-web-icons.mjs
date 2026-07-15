/**
 * Dev-only: generate the PWA icon set for the web app from the same
 * "convergence" mark used by the mobile placeholder art. Run once:
 *
 *   npm install sharp --no-save
 *   node scripts/gen-web-icons.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const NIGHT = "#0c0a08";
const ACCENT = "#f0a431";

const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(root, "..", "public", "icons");

function svg(size, { pad = 0 } = {}) {
  const c = size / 2;
  const scale = 1 - pad * 2;
  const seeds = Array.from({ length: 36 }, (_, i) => {
    const a = (i * 2.39996) % (Math.PI * 2);
    const r = (size * 0.07 + ((i * 53) % Math.floor(size * 0.33))) * scale;
    const x = c + Math.cos(a) * r;
    const y = c + Math.sin(a) * r;
    const rad = (1 + ((i * 7) % 5)) * scale;
    const op = 0.18 + (i % 6) * 0.07;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(1)}" fill="${ACCENT}" opacity="${op.toFixed(2)}"/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="${NIGHT}"/>
    <defs>
      <radialGradient id="glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.5"/>
        <stop offset="60%" stop-color="${ACCENT}" stop-opacity="0.06"/>
        <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="${c}" cy="${c}" r="${size * 0.42 * scale}" fill="url(#glow)"/>
    ${seeds}
    <circle cx="${c}" cy="${c}" r="${size * 0.045 * scale}" fill="${ACCENT}"/>
  </svg>`;
}

await mkdir(outDir, { recursive: true });

const jobs = [
  { file: "icon-192.png", size: 192, pad: 0 },
  { file: "icon-512.png", size: 512, pad: 0 },
  // Maskable: keep the mark inside the 80% safe zone.
  { file: "icon-maskable-512.png", size: 512, pad: 0.1 },
  { file: "apple-touch-icon.png", size: 180, pad: 0 },
];

for (const { file, size, pad } of jobs) {
  const png = await sharp(Buffer.from(svg(size, { pad }))).png().toBuffer();
  await writeFile(path.join(outDir, file), png);
  console.log(`wrote public/icons/${file}`);
}
