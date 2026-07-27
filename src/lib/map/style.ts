import type { TileLayer } from "leaflet";

/**
 * The OutsiderMap basemap - one visual language for every map in the app.
 *
 * All maps render with Leaflet on CARTO's "dark_nolabels" raster basemap: a
 * clean dark map with NO street names or POI labels (our no-clutter product
 * law holds), served from a global CDN with strong reach - including India,
 * our launch market. Raster over WebGL is deliberate: on some phones a GL
 * canvas never painted and left the map black with no error to catch (see
 * map-canvas.tsx). Plain <img> tiles draw on effectively any device.
 *
 * The only labels on screen are OURS - amber place names drawn by the
 * consumers on top of these tiles.
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

/** CARTO dark, label-free raster. Keyless; attribution required. */
export const CARTO_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png";

export const MAP_ATTRIBUTION =
  "&copy; OpenStreetMap contributors &copy; CARTO";

/**
 * The shared basemap tile layer. Pass the client-side Leaflet module (the
 * consumers dynamic-import it - Leaflet touches window at import, which would
 * break SSR). Callers chain handlers (e.g. `tileerror`) and `.addTo(map)`.
 */
export function baseTileLayer(L: typeof import("leaflet")): TileLayer {
  return L.tileLayer(CARTO_TILE_URL, {
    subdomains: "abcd",
    detectRetina: true,
    maxZoom: 20,
    attribution: MAP_ATTRIBUTION,
  });
}
