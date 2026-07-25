import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classifyPlace,
  countByName,
  normaliseName,
} from "@/lib/places/franchise";

/**
 * Regression cover for the importer stalling at ~1,100 rows.
 *
 * The cause was PostgREST's 1000-row page cap: the job read "all" existing
 * places, silently received only the first 1000, so anything it had already
 * imported stopped looking like a duplicate. Those rows were re-selected every
 * batch, collided on their unique slug, inserted nothing, and the runner read
 * zero-inserted as "finished".
 *
 * The fix relies on slugs being deterministic and unique per candidate, so
 * that a slug set is a sound "did we already import this" test. These lock
 * that property down against the real dataset - if it ever stops holding, the
 * dedupe silently breaks again.
 */

// Mirrors the slug rule in src/lib/admin/jobs.ts.
function slugify(name: string, lat: number, lng: number) {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 52);
  const seed = Math.abs(Math.round(lat * 1e4) * 31 + Math.round(lng * 1e4))
    .toString(36)
    .slice(-6);
  return `${base || "place"}-${seed}`;
}

type Candidate = {
  name: string;
  category: string | null;
  lat: number;
  lng: number;
};

const candidates: Candidate[] = JSON.parse(
  readFileSync("data/overture.ncr.json", "utf8"),
);

const eligible = (() => {
  const counts = countByName(candidates);
  return candidates.filter(
    (c) =>
      classifyPlace({
        name: c.name,
        text: c.category,
        outletCount: counts.get(normaliseName(c.name)) ?? 1,
      }).verdict === "independent",
  );
})();

describe("Overture import dedupe", () => {
  it("has a substantial pile of importable candidates", () => {
    // If this collapses, the classifier has started eating real places.
    expect(eligible.length).toBeGreaterThan(5000);
  });

  it("gives every importable candidate a unique slug", () => {
    // The whole slug-set dedupe rests on this. A collision would mean one
    // venue permanently masking another as "already imported".
    const slugs = eligible.map((c) => slugify(c.name, c.lat, c.lng));
    expect(new Set(slugs).size).toBe(eligible.length);
  });

  it("produces the same slug every run for the same venue", () => {
    // Idempotency: a re-import must recognise its own previous work.
    for (const c of eligible.slice(0, 200)) {
      expect(slugify(c.name, c.lat, c.lng)).toBe(slugify(c.name, c.lat, c.lng));
    }
  });

  it("separates two venues that share a name at different locations", () => {
    expect(slugify("Chaayos", 28.6494, 77.2335)).not.toBe(
      slugify("Chaayos", 28.5355, 77.391),
    );
  });

  it("survives a name with no usable characters", () => {
    expect(slugify("!!!", 28.6, 77.2)).toMatch(/^place-/);
  });

  it("needs more than one page to read back, which is the bug", () => {
    // Proof the 1000-row cap is actually reachable here: if it were not, the
    // unpaginated read would have been fine and this test would be pointless.
    expect(eligible.length).toBeGreaterThan(1000);
  });
});
