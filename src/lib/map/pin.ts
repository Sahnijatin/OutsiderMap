import type { CategoryGroup } from "./categories";

/**
 * The 3D map pin, as an SVG string for a Leaflet `divIcon`.
 *
 * A glossy teardrop: a vertical gradient (light top → base → dark bottom), a
 * soft specular highlight, a night-dark "hole", and a ground shadow so the pin
 * reads as standing off the map rather than lying flat on it. Colored per
 * category group. The tip sits at the geo coordinate (see `iconAnchor` where
 * this is consumed); the head rises above it.
 */

export const PIN_W = 30;
export const PIN_H = 42;
/** Icon anchor: the pin's tip, at the bottom center. */
export const PIN_ANCHOR: [number, number] = [15, 39];

const BODY_PATH =
  "M15 2C8.4 2 3 7.3 3 14c0 8.4 12 24.6 12 24.6S27 22.4 27 14C27 7.3 21.6 2 15 2z";

/**
 * Build the marker HTML. The gradient id is namespaced per group; duplicate
 * ids across markers are fine — SVG resolves each `url(#id)` to the first
 * matching (identical) definition, which is what we want.
 */
export function pinHtml(group: CategoryGroup): string {
  const gid = `ompin-${group.id}`;
  return (
    `<div class="om-pin" style="--pin:${group.color}">` +
    `<svg viewBox="0 0 ${PIN_W} ${PIN_H}" width="${PIN_W}" height="${PIN_H}" aria-hidden="true">` +
    `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${group.light}"/>` +
    `<stop offset="0.55" stop-color="${group.color}"/>` +
    `<stop offset="1" stop-color="${group.dark}"/>` +
    `</linearGradient></defs>` +
    `<ellipse class="om-pin__shadow" cx="15" cy="40" rx="4.4" ry="1.5"/>` +
    `<path class="om-pin__body" d="${BODY_PATH}" fill="url(#${gid})" stroke="${group.dark}" stroke-width="0.6"/>` +
    `<circle cx="15" cy="14" r="4.6" fill="#0c0a08" fill-opacity="0.9"/>` +
    `<ellipse class="om-pin__gloss" cx="11.4" cy="9.6" rx="3.8" ry="2.5" fill="#ffffff" fill-opacity="0.4"/>` +
    `</svg></div>`
  );
}
