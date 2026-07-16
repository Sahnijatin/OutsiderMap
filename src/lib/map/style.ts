import type { StyleSpecification } from "maplibre-gl";

/**
 * The OutsiderMap basemap: Delhi-night dark, geometry-first. Built on
 * OpenFreeMap's OpenMapTiles vector schema. The basemap contributes NO
 * street names, no POI icons, no transit shields - the only symbol layer it
 * owns is quiet neighbourhood/city names for orientation; every place label
 * on screen is ours.
 *
 * Colors come from the brand tokens in globals.css (hardcoded here because
 * MapLibre needs literal values in the style JSON - keep in sync).
 */

const TILES_URL = "https://tiles.openfreemap.org/planet";
export const GLYPHS_URL =
  "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

export const MAP_NIGHT = "#0c0a08";
export const MAP_INK = "#ede7db";
export const MAP_INK_DIM = "#9b9183";
export const MAP_ACCENT = "#f0a431";
/** Amber-tinted ink for our own place-name labels. */
export const MAP_LABEL_AMBER = "#e6c789";

const SURFACE = "#16120e";
// Roads a few steps brighter than the old RAISE/LINE values - the founder's
// laptop read the map as pure black. Warm greys keep the night feel.
const ROAD_MINOR = "#2a231b";
const ROAD_MID = "#342c22";
const ROAD_MAJOR = "#40372b";
const WATER = "#101720";
const GREEN = "#17200f";

export function baseMapStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sources: {
      om: { type: "vector", url: TILES_URL },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": MAP_NIGHT } },
      {
        id: "green",
        type: "fill",
        source: "om",
        "source-layer": "landcover",
        paint: { "fill-color": GREEN, "fill-opacity": 0.85 },
      },
      {
        id: "park",
        type: "fill",
        source: "om",
        "source-layer": "park",
        paint: { "fill-color": GREEN, "fill-opacity": 1 },
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
      // Roads: three weights, quiet but visible. Texture, not a chart.
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
          "line-color": ROAD_MINOR,
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
          "line-color": ROAD_MID,
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
          "line-color": ROAD_MAJOR,
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.8, 16, 6],
        },
      },
      // Orientation labels ONLY: city/suburb/neighbourhood names, uppercase
      // mono-quiet. Still zero street names and zero POIs.
      {
        id: "place-labels",
        type: "symbol",
        source: "om",
        "source-layer": "place",
        minzoom: 9,
        maxzoom: 14.5,
        filter: [
          "in",
          ["get", "class"],
          ["literal", ["city", "town", "suburb", "quarter", "neighbourhood"]],
        ],
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 9, 10.5, 14, 13],
          "text-letter-spacing": 0.08,
          "text-transform": "uppercase",
        },
        paint: {
          "text-color": MAP_INK_DIM,
          "text-halo-color": MAP_NIGHT,
          "text-halo-width": 1.2,
          "text-opacity": 0.85,
        },
      },
    ],
  };
}
