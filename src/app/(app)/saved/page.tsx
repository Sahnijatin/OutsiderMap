import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { openStatusLabel } from "@/lib/places/hours";
import { Badge } from "@/components/ui/badge";
import { priceGlyph } from "@/lib/utils";
import { unsavePlace } from "@/app/(app)/now/actions";

export const metadata: Metadata = {
  title: "Saved",
};

export default async function SavedPage() {
  const profile = await requireOnboarded();
  const supabase = await createClient();

  const { data: saved } = await supabase
    .from("saved_places")
    .select(
      "place_id, note, created_at, places (id, slug, name, area, category, price_level, vibe_tags, editor_note, hours)",
    )
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });

  async function remove(formData: FormData) {
    "use server";
    const placeId = formData.get("place_id");
    if (typeof placeId === "string") {
      await unsavePlace(placeId);
      revalidatePath("/saved");
    }
  }

  return (
    <main className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="voice">Saved · {saved?.length ?? 0}</p>
        <h1 className="font-display text-3xl sm:text-4xl">Your shortlist.</h1>
      </header>

      {!saved || saved.length === 0 ? (
        <div className="rounded-card border border-line bg-surface p-10 text-center">
          <p className="font-display text-xl">Nothing saved yet.</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-dim">
            When an answer lands, hit Save and it lives here — your own map
            of the city.
          </p>
          <Link
            href="/now"
            className="mt-5 inline-block text-sm text-accent hover:underline"
          >
            Ask for something →
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {saved.map((row) => {
            const place = row.places;
            if (!place) return null;
            const open = openStatusLabel(place.hours);
            return (
              <li
                key={row.place_id}
                className="rounded-card border border-line bg-surface p-5"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="font-display text-xl">{place.name}</h2>
                  <span className="text-sm text-ink-dim">
                    {[place.area, place.category, priceGlyph(place.price_level)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {open && (
                    <Badge variant={open.startsWith("open") ? "accent" : "outline"}>
                      {open}
                    </Badge>
                  )}
                </div>
                {place.editor_note && (
                  <p className="mt-2 text-sm leading-relaxed text-ink-dim">
                    {place.editor_note}
                  </p>
                )}
                <form action={remove} className="mt-4">
                  <input type="hidden" name="place_id" value={row.place_id} />
                  <button
                    type="submit"
                    className="text-sm text-ink-dim transition-colors hover:text-danger"
                  >
                    Remove
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
