/**
 * Google Maps directions deep links. Opens the Google Maps app on mobile,
 * google.com/maps on desktop.
 *
 * The destination is only exact when we send a `place_id`. Without one Google
 * runs a *text search* on whatever we pass, so "Karim's 28.6494,77.2335"
 * resolves to whichever Karim's its matcher prefers - which is how you end up
 * navigating to the wrong venue in a city that has a dozen of them.
 * `destination_place_id` skips matching entirely.
 *
 * Coordinates stay in the URL as the fallback destination for places we have
 * not resolved yet: a bare point drops you on the right spot on the map even
 * though it names nothing.
 */

export type DirectionsTarget = {
  lat: number;
  lng: number;
  name?: string | null;
  /** Google `place_id`. The only Google field we store; makes this exact. */
  googlePlaceId?: string | null;
};

export function googleMapsDirUrl(target: DirectionsTarget): string;
/** @deprecated Pass a {@link DirectionsTarget} so the place_id can be used. */
export function googleMapsDirUrl(
  lat: number,
  lng: number,
  name?: string | null,
): string;
export function googleMapsDirUrl(
  targetOrLat: DirectionsTarget | number,
  lng?: number,
  name?: string | null,
): string {
  const target: DirectionsTarget =
    typeof targetOrLat === "number"
      ? { lat: targetOrLat, lng: lng as number, name }
      : targetOrLat;

  const params = new URLSearchParams({ api: "1" });

  if (target.googlePlaceId) {
    // With a place_id Google ignores coordinate ambiguity entirely. The
    // human-readable destination is still sent so the UI has something to
    // show while the app resolves it.
    params.set("destination", target.name ?? `${target.lat},${target.lng}`);
    params.set("destination_place_id", target.googlePlaceId);
  } else {
    // No place_id: coordinates only. Deliberately *not* "name coords" - that
    // is a text search, and a wrong-but-confident match is worse than an
    // unnamed pin on the correct spot.
    params.set("destination", `${target.lat},${target.lng}`);
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
