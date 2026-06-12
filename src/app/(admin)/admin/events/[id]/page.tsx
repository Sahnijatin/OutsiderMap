import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { EventForm } from "../event-form";

export const metadata: Metadata = {
  title: "Admin · Edit event",
};

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!event) notFound();

  return (
    <main className="flex flex-col gap-6">
      <h1 className="font-display text-3xl">{event.title}</h1>
      <EventForm event={event} />
    </main>
  );
}
