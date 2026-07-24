import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data attribution",
  description:
    "Where OutsiderMap's place data comes from, and the licences it is used under.",
};

/**
 * Attribution for the open data behind the catalog.
 *
 * This is an obligation, not a courtesy. The Overture places theme is
 * permissive - no share-alike - but each contributing source keeps its own
 * attribution requirement, and Foursquare's Apache-2.0 share specifically
 * requires its notice be carried. A public page is the standard way to
 * discharge that for a consumer app.
 */
export default function AttributionPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      <h1 className="font-display text-3xl italic">Where our data comes from</h1>
      <p className="mt-4 text-sm leading-relaxed text-ink-dim">
        Most of what is on this map was found, written up and checked by people.
        Some of the groundwork - the names and locations we start from - comes
        from open data, and those projects deserve the credit.
      </p>

      <section className="mt-10">
        <h2 className="font-display text-xl italic">Overture Maps Foundation</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          Place names, categories and locations are seeded from the{" "}
          <a
            href="https://overturemaps.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink underline hover:text-accent"
          >
            Overture Maps Foundation
          </a>{" "}
          places theme, which draws on several contributors under permissive
          licences.
        </p>
        <dl className="mt-4 space-y-2 rounded-card border border-line bg-surface p-4 text-sm">
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-ink-dim">CDLA-Permissive 2.0</dt>
            <dd className="text-ink">
              Meta, Microsoft, PinMeTo, Krick, RenderSEO, DAC, BrightQuery
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-ink-dim">Apache License 2.0</dt>
            <dd className="text-ink">Foursquare</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-ink-dim">CC0 1.0</dt>
            <dd className="text-ink">AllThePlaces</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-ink-dim">
          Foursquare data is provided under the Apache License, Version 2.0. You
          may obtain a copy of the licence at{" "}
          <a
            href="https://www.apache.org/licenses/LICENSE-2.0"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-ink"
          >
            apache.org/licenses/LICENSE-2.0
          </a>
          . The data is distributed on an &quot;AS IS&quot; basis, without
          warranties or conditions of any kind.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl italic">Map tiles</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          The map itself is drawn from{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink underline hover:text-accent"
          >
            OpenStreetMap
          </a>{" "}
          data, contributed by people who map their own neighbourhoods, and
          available under the Open Database License.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl italic">Photos and reels</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          Photos are taken by members and shared with us under our terms. Reels
          and videos from Instagram or YouTube are embedded, not copied - the
          platform serves them, and the creator&apos;s handle and a link back to
          their post travel with every one. We do not host anybody else&apos;s
          video.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          If something of yours is here and you would rather it were not, write
          to us and we will take it down.
        </p>
      </section>
    </main>
  );
}
