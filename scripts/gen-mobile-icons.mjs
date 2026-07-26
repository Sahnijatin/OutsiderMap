/**
 * Generate the Capacitor source app art: the "convergence" mark (scattered
 * amber lights resolving to one) on the Delhi-night background.
 *
 * Emits the files `@capacitor/assets` expects at the repo-root `assets/` dir:
 *   assets/icon.png        1024x1024  app icon source
 *   assets/splash.png      2732x2732  splash source (dark brand bg)
 *   assets/splash-dark.png 2732x2732  dark-mode splash (same dark brand bg)
 *
 * These are committed source assets. CI turns them into every platform size
 * with `npx capacitor-assets generate` after `cap sync` (all four native
 * build workflows). Swap for final brand art by replacing the PNGs. Re-run:
 *
 *   node scripts/gen-mobile-icons.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const NIGHT = "#0c0a08";
const ACCENT = "#f0a431";

const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(root, "..", "assets");

/**
 * A square convergence mark on the night plate. `mark` scales the artwork
 * relative to the canvas so the splash keeps the mark inside the center crop
 * region that `@capacitor/assets` cuts for each device.
 */
function svg(size, { mark = 1 } = {}) {
  const c = size / 2;
  const m = (size / 2) * mark; // artwork radius
  // Deterministic scatter of faint lights drifting toward the center.
  const seeds = Array.from({ length: 36 }, (_, i) => {
    const a = (i * 2.39996) % (Math.PI * 2); // golden-angle spread
    const r = m * 0.14 + ((i * 53 * mark) % Math.floor(m * 0.66));
    const x = c + Math.cos(a) * r;
    const y = c + Math.sin(a) * r;
    const rad = (1 + ((i * 7) % 5)) * (m / 512);
    const op = 0.18 + ((i % 6) * 0.07);
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
    <circle cx="${c}" cy="${c}" r="${m * 0.84}" fill="url(#glow)"/>
    ${seeds}
    <circle cx="${c}" cy="${c}" r="${m * 0.09}" fill="${ACCENT}"/>
  </svg>`;
}

async function render(name, size, opts) {
  const buf = await sharp(Buffer.from(svg(size, opts))).png().toBuffer();
  await writeFile(path.join(outDir, name), buf);
  console.log(`  ${name}  (${size}x${size})`);
}

await mkdir(outDir, { recursive: true });
console.log("Generating Capacitor source art (assets/):");
await render("icon.png", 1024, { mark: 1 });
// Keep the splash mark well inside the device-crop safe zone (~40% of canvas).
await render("splash.png", 2732, { mark: 0.38 });
await render("splash-dark.png", 2732, { mark: 0.38 });
console.log("Done.");
