import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlaceForm } from "../place-form";

export const metadata: Metadata = {
  title: "Admin · Edit place",
};

export default async function EditPlacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();
  const { data: place } = await admin
    .from("places")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!place) notFound();

  return (
    <main className="flex flex-col gap-6">
      <Link
        href="/admin/places"
        className="voice transition-colors hover:text-ink"
      >
        ← Places
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl">{place.name}</h1>
        <p className="font-mono text-xs text-ink-dim">
          {place.slug} · {place.source}
        </p>
      </div>
      <PlaceForm
        place={place}
        googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null}
      />
    </main>
  );
}
