import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { PlaceForm } from "../place-form";

export const metadata: Metadata = {
  title: "Admin · New place",
};

export default async function NewPlacePage() {
  await requireAdmin();
  return (
    <main className="flex flex-col gap-6">
      <h1 className="font-display text-3xl">New place</h1>
      <PlaceForm />
    </main>
  );
}
