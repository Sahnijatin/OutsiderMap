import type { StyleSpecification } from "maplibre-gl";

/**
 * The OutsiderMap basemap: Delhi-night dark, geometry only. Built on
 * OpenFreeMap's OpenMapTiles vector schema, but with ZERO symbol layers from
 * the basemap - no street names, no POI icons, no transit shields. The city
 * reads as shapes and light; the only labels on screen are ours.
 *
 * Colors come from the brand tokens in globals.css (hardcoded here because
 * MapLibre needs literal values in the style JSON - keep in sync).
 */

const TILES_URL = "https://tiles.openfreemap.org/planet";
export const GLYPHS_URL =
  "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

const NIGHT = "#0c0a08";
const SURFACE = "#16120e";
const RAISE = "#1e1914";
const LINE = "#2b241c";
const WATER = "#0b0f13";
const GREEN = "#11150d";

export function baseMapStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sources: {
      om: { type: "vector", url: TILES_URL },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": NIGHT } },
      {
        id: "green",
        type: "fill",
        source: "om",
        "source-layer": "landcover",
        paint: { "fill-color": GREEN, "fill-opacity": 0.8 },
      },
      {
        id: "park",
        type: "fill",
        source: "om",
        "source-layer": "park",
        paint: { "fill-color": GREEN, "fill-opacity": 0.9 },
      },
      {
        id: "water",
        type: "fill",
        source: "om",
        "source-layer": "water",
        paint: { "fill-color": WATER },
      },
      {
        id: "buildings",
        type: "fill",
        source: "om",
        "source-layer": "building",
        minzoom: 13,
        paint: { "fill-color": SURFACE, "fill-opacity": 0.55 },
      },
      // Roads: three weights, all quiet. The city is a texture, not a chart.
      {
        id: "roads-minor",
        type: "line",
        source: "om",
        "source-layer": "transportation",
        minzoom: 12,
        filter: [
          "in",
          ["get", "class"],
          ["literal", ["minor", "service", "track", "path"]],
        ],
        paint: {
          "line-color": RAISE,
          "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.4, 16, 2],
        },
      },
      {
        id: "roads-mid",
        type: "line",
        source: "om",
        "source-layer": "transportation",
        filter: [
          "in",
          ["get", "class"],
          ["literal", ["secondary", "tertiary"]],
        ],
        paint: {
          "line-color": RAISE,
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 16, 4],
        },
      },
      {
        id: "roads-major",
        type: "line",
        source: "om",
        "source-layer": "transportation",
        filter: [
          "in",
          ["get", "class"],
          ["literal", ["motorway", "trunk", "primary"]],
        ],
        paint: {
          "line-color": LINE,
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.8, 16, 6],
        },
      },
    ],
  };
}
