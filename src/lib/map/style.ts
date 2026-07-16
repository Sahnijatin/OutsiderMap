import type { StyleSpecification } from "maplibre-gl";

/**
 * The OutsiderMap basemap.
 *
 * We render on CARTO's "dark_nolabels" raster basemap: a clean dark map with
 * NO street names or POI labels (our no-clutter product law holds), served
 * from a global CDN with strong reach - including India, our launch market.
 * We moved off the free single-host OpenFreeMap vector tiles because they
 * did not load reliably on Indian mobile networks and left the map black.
 *
 * The only labels on screen are still OURS - place names and cluster counts
 * are symbol layers added in map-canvas, drawn with self-hosted Noto Sans
 * glyphs (public/fonts) so text has no third-party dependency either.
 *
 * Brand color constants are exported for the overlay layers; keep in sync
 * with globals.css.
 */

export const MAP_NIGHT = "#0c0a08";
export const MAP_INK = "#ede7db";
export const MAP_INK_DIM = "#9b9183";
export const MAP_ACCENT = "#f0a431";
/** Amber-tinted ink for our own place-name labels. */
export const MAP_LABEL_AMBER = "#e6c789";

/** Self-hosted glyphs - no external font host to fail. */
export const GLYPHS_URL = "/fonts/{fontstack}/{range}.pbf";

/** CARTO dark, label-free raster. Keyless; attribution required. */
const CARTO_TILES = [
  "https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png",
  "https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png",
  "https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png",
  "https://d.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png",
];

export const MAP_ATTRIBUTION =
  '© OpenStreetMap contributors © CARTO';

export function baseMapStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sources: {
      basemap: {
        type: "raster",
        tiles: CARTO_TILES,
        tileSize: 256,
        minzoom: 0,
        maxzoom: 20,
        attribution: MAP_ATTRIBUTION,
      },
    },
    layers: [
      // A night floor under the tiles so any single missing tile reads as
      // brand-dark, never a bright gap.
      { id: "bg", type: "background", paint: { "background-color": MAP_NIGHT } },
      { id: "basemap", type: "raster", source: "basemap" },
    ],
  };
}
