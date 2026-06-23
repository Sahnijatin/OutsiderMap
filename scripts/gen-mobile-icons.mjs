/**
 * Dev-only: generate on-brand placeholder app art for the Expo app.
 *
 * Renders the "convergence" mark (scattered amber lights resolving to one) on
 * the Delhi-night background into the PNGs Expo expects. Swap for final brand
 * art later. Run once:
 *
 *   npm install sharp --no-save
 *   node scripts/gen-mobile-icons.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const NIGHT = "#0c0a08";
const ACCENT = "#f0a431";

const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(root, "..", "mobile", "assets");

/** A square convergence mark. `bg` controls whether the night plate is drawn
 * (icon/splash) vs transparent (adaptive foreground). */
function svg(size, { bg = true } = {}) {
  const c = size / 2;
  // Deterministic scatter of faint lights drifting toward the center.
  const seeds = Array.from({ length: 36 }, (_, i) => {
    const a = (i * 2.39996) % (Math.PI * 2); // golden-angle spread
    const r = (size * 0.07) + ((i * 53) % Math.floor(size * 0.33));
    const x = c + Math.cos(a) * r;
    const y = c + Math.sin(a) * r;
    const rad = 1 + ((i * 7) % 5);
    const op = 0.18 + ((i % 6) * 0.07);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad}" fill="${ACCENT}" opacity="${op.toFixed(2)}"/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${bg ? `<rect width="${size}" height="${size}" fill="${NIGHT}"/>` : ""}
    <defs>
      <radialGradient id="glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.5"/>
        <stop offset="60%" stop-color="${ACCENT}" stop-opacity="0.06"/>
        <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="${c}" cy="${c}" r="${size * 0.42}" fill="url(#glow)"/>
    ${seeds}
    <circle cx="${c}" cy="${c}" r="${size * 0.045}" fill="${ACCENT}"/>
  </svg>`;
}

async function render(name, size, opts) {
  const buf = await sharp(Buffer.from(svg(size, opts))).png().toBuffer();
  await writeFile(path.join(outDir, name), buf);
  console.log(`  ${name}  (${size}x${size})`);
}

await mkdir(outDir, { recursive: true });
console.log("Generating mobile brand art:");
await render("icon.png", 1024, { bg: true });
await render("splash-icon.png", 1024, { bg: true });
await render("adaptive-icon.png", 1024, { bg: false });
console.log("Done.");
