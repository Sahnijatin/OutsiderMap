import "server-only";
import type { CatalogCandidate } from "@/lib/catalog/search";

/**
 * Region-to-neighbourhood mapping for area filtering (the "west delhi" bug).
 *
 * People ask in regions - "south delhi", "west delhi" - but the catalog and
 * `match_places` only know specific neighbourhoods, and the old filter
 * (`city.areas.includes(area)`) silently dropped anything that wasn't an
 * exact, case-sensitive neighbourhood name. The result: a "West Delhi" ask
 * searched city-wide and came back confidently labeled West Delhi while every
 * stop sat in Khan Market.
 *
 * Membership below intersects with the city's live `areas` list at resolve
 * time, so a region only ever expands to neighbourhoods the catalog actually
 * has. Keys are matched case-insensitively; the trailing "delhi" is optional
 * ("south" == "south delhi").
 */
const REGION_AREAS: Record<string, string[]> = {
  "south delhi": [
    "Hauz Khas", "Shahpur Jat", "Champa Gali", "Mehrauli", "Greater Kailash",
    "Saket", "Vasant Kunj", "Lajpat Nagar", "Defence Colony", "Green Park",
    "Malviya Nagar", "Chittaranjan Park", "Safdarjung", "Vasant Vihar",
    "Sarojini Nagar", "INA", "Yusuf Sarai", "Satya Niketan", "Okhla",
    "Jamia Nagar", "Jangpura", "Nizamuddin", "Aerocity",
  ],
  "west delhi": [
    "Rajouri Garden", "Punjabi Bagh", "Janakpuri", "Dwarka",
  ],
  "north delhi": [
    "Kamla Nagar", "Model Town", "Civil Lines", "North Campus",
    "Majnu ka Tilla", "Pitampura",
  ],
  "east delhi": [
    "Shahdara", "Preet Vihar", "Mayur Vihar", "Laxmi Nagar",
  ],
  "central delhi": [
    "Connaught Place", "Khan Market", "Lodhi Colony", "Karol Bagh",
    "Paharganj", "Daryaganj", "Jangpura", "INA",
  ],
  "old delhi": ["Old Delhi", "Chandni Chowk", "Daryaganj", "Civil Lines"],
  gurgaon: [
    "Gurgaon", "Cyber Hub", "Golf Course Road", "Sohna Road", "Sector 29",
    "MG Road Gurgaon", "Sushant Lok", "DLF Phase 1", "DLF Phase 3", "Manesar",
  ],
  gurugram: [
    "Gurgaon", "Cyber Hub", "Golf Course Road", "Sohna Road", "Sector 29",
    "MG Road Gurgaon", "Sushant Lok", "DLF Phase 1", "DLF Phase 3", "Manesar",
  ],
  noida: [
    "Noida", "Sector 18 Noida", "Sector 62 Noida", "Sector 104 Noida",
    "Greater Noida", "Knowledge Park",
  ],
  ghaziabad: ["Ghaziabad", "Indirapuram", "Vaishali", "Raj Nagar Extension"],
  faridabad: ["Faridabad", "Sector 15 Faridabad", "Ballabgarh"],
};

export type AreaFilter =
  /** A single known neighbourhood, in the catalog's canonical casing. */
  | { kind: "area"; area: string }
  /** A region that expands to (catalog-known) neighbourhoods. */
  | { kind: "region"; label: string; areas: string[] }
  /** Something was asked for but nothing in the catalog matches it. */
  | { kind: "unmatched"; requested: string }
  /** No area was asked for at all. */
  | { kind: "none" };

/**
 * Resolve a user-stated area into an applicable filter: a canonical
 * neighbourhood (case-insensitive), a region expanded to the city's actual
 * neighbourhoods, or an explicit "unmatched" so callers can be LOUD about a
 * filter they could not apply instead of silently searching city-wide.
 */
export function resolveAreaFilter(
  requested: string | null | undefined,
  cityAreas: string[],
): AreaFilter {
  const raw = requested?.trim();
  if (!raw) return { kind: "none" };

  const wanted = raw.toLowerCase();
  const canonical = cityAreas.find((a) => a.toLowerCase() === wanted);
  if (canonical) return { kind: "area", area: canonical };

  // "south" and "south delhi" mean the same thing in conversation.
  const regionKey =
    wanted in REGION_AREAS
      ? wanted
      : `${wanted} delhi` in REGION_AREAS
        ? `${wanted} delhi`
        : null;
  if (regionKey) {
    const known = new Set(cityAreas.map((a) => a.toLowerCase()));
    const areas = REGION_AREAS[regionKey].filter((a) =>
      known.has(a.toLowerCase()),
    );
    if (areas.length > 0) return { kind: "region", label: regionKey, areas };
  }

  return { kind: "unmatched", requested: raw };
}

/**
 * Post-filter candidates to a region's neighbourhoods. Relaxes back to the
 * full list when the region starves the pool (below `min`) - but SAYS so via
 * `relaxed`, because a silent relax is how a Khan Market evening got sold as
 * West Delhi.
 */
export function filterByAreas(
  candidates: CatalogCandidate[],
  areas: string[],
  min = 3,
): { candidates: CatalogCandidate[]; relaxed: boolean } {
  const allowed = new Set(areas.map((a) => a.toLowerCase()));
  const inRegion = candidates.filter(
    (c) => c.area && allowed.has(c.area.toLowerCase()),
  );
  if (inRegion.length >= min) return { candidates: inRegion, relaxed: false };
  return { candidates, relaxed: true };
}
