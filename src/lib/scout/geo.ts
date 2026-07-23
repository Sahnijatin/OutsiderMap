/**
 * Geo helpers for scout verification. Mirrors the SQL `geo_distance_m` +
 * radius gate so the client can pre-check "are you close enough?" before a
 * confirmation is submitted (the server recomputes and is authoritative).
 */

/** On-site radius, in metres, a confirmation must fall within. */
export const GEO_RADIUS_M = 150;

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance between two lat/lng points, in metres. */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** Whether a captured point is within `radius` metres of the place. */
export function withinRadius(
  placeLat: number,
  placeLng: number,
  capturedLat: number,
  capturedLng: number,
  radius: number = GEO_RADIUS_M,
): boolean {
  return distanceMeters(placeLat, placeLng, capturedLat, capturedLng) <= radius;
}
