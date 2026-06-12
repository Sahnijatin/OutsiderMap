import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { EventForm } from "../event-form";

export const metadata: Metadata = {
  title: "Admin · New event",
};

export default async function NewEventPage() {
  await requireAdmin();
  return (
    <main className="flex flex-col gap-6">
      <h1 className="font-display text-3xl">New event</h1>
      <EventForm />
    </main>
  );
}
