/**
 * A Google Maps directions deep link to a place. When we have a name we send
 * it alongside the exact coordinates ("Karim's 28.65,77.23") so Google resolves
 * the real venue rather than dropping the pin on a bare point; otherwise the
 * coordinates alone. Opens the Google Maps app on mobile, google.com/maps on
 * desktop.
 */
export function googleMapsDirUrl(
  lat: number,
  lng: number,
  name?: string | null,
): string {
  const destination = name ? `${name} ${lat},${lng}` : `${lat},${lng}`;
  const params = new URLSearchParams({ api: "1", destination });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
