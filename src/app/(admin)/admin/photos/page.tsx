import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicMediaUrl } from "@/lib/media/url";
import { Button } from "@/components/ui/button";
import { publishPlacePhoto, rejectPlacePhoto } from "./actions";

export const dynamic = "force-dynamic";

/**
 * The contributed-photo queue.
 *
 * Every member photo lands here pending, because the image moderator holds
 * everything until a vision vendor is onboarded (#91). That makes this page
 * load-bearing rather than administrative: a photo nobody clears never
 * reaches the person who took it, and they do not send a second one.
 */
export default async function AdminPhotosPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: pending } = await admin
    .from("place_media")
    .select(
      "id, storage_path, caption, created_at, captured_lat, captured_lng, place:places(slug, name, area), contributor:profiles(username, outsider_number)",
    )
    .eq("status", "pending")
    .order("created_at")
    .limit(60);

  const rows = pending ?? [];

  return (
    <div>
      <header className="mb-5">
        <h1 className="font-display text-2xl italic">Contributed photos</h1>
        <p className="mt-1 text-sm text-ink-dim">
          {rows.length === 0
            ? "Nothing waiting."
            : `${rows.length} waiting. These stay invisible until you publish them.`}
        </p>
      </header>

      {rows.length === 0 ? null : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => {
            const src = publicMediaUrl("place-images", row.storage_path);
            const place = Array.isArray(row.place) ? row.place[0] : row.place;
            const who = Array.isArray(row.contributor)
              ? row.contributor[0]
              : row.contributor;
            return (
              <li
                key={row.id}
                className="overflow-hidden rounded-card border border-line bg-surface"
              >
                {src && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src}
                    alt=""
                    className="aspect-[4/3] w-full object-cover"
                  />
                )}
                <div className="p-3">
                  <p className="text-sm text-ink">
                    {place?.name ?? "Unknown place"}
                    {place?.area ? (
                      <span className="text-ink-dim"> · {place.area}</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-dim">
                    {who?.username ? `@${who.username}` : "an outsider"}
                    {row.captured_lat != null ? " · has GPS" : " · no GPS"}
                  </p>
                  {row.caption && (
                    <p className="mt-1 text-xs text-ink-dim">{row.caption}</p>
                  )}

                  <div className="mt-3 flex gap-2">
                    <form action={publishPlacePhoto}>
                      <input type="hidden" name="id" value={row.id} />
                      <Button type="submit" size="sm">
                        Publish
                      </Button>
                    </form>
                    <form action={rejectPlacePhoto}>
                      <input type="hidden" name="id" value={row.id} />
                      <Button type="submit" size="sm" variant="danger">
                        Reject
                      </Button>
                    </form>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
