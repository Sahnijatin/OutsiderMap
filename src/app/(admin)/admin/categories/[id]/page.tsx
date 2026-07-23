import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { CategoryForm } from "../category-form";

export const metadata: Metadata = { title: "Admin · Edit category" };

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();
  const { data: category } = await admin
    .from("map_categories")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!category) notFound();

  return (
    <main className="flex flex-col gap-6">
      <Link
        href="/admin/categories"
        className="voice transition-colors hover:text-ink"
      >
        ← Categories
      </Link>
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="size-5 rounded-full ring-1 ring-black/30"
          style={{ background: category.color }}
        />
        <h1 className="font-display text-3xl">{category.label}</h1>
      </div>
      <CategoryForm category={category} />
    </main>
  );
}
