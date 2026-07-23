import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { CategoryForm } from "../category-form";

export const metadata: Metadata = { title: "Admin · New category" };

export default async function NewCategoryPage() {
  await requireAdmin();
  return (
    <main className="flex flex-col gap-6">
      <Link
        href="/admin/categories"
        className="voice transition-colors hover:text-ink"
      >
        ← Categories
      </Link>
      <h1 className="font-display text-3xl">New category</h1>
      <CategoryForm />
    </main>
  );
}
