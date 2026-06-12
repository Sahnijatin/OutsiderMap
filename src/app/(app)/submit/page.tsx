import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireOnboarded, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";

export const metadata: Metadata = {
  title: "Suggest a place",
};

const SubmissionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  area: z.string().trim().max(80).optional(),
  category: z.string().trim().max(40).optional(),
  description: z.string().trim().min(10).max(1000),
});

export default async function SubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  await requireOnboarded();
  const { sent } = await searchParams;

  async function submit(formData: FormData) {
    "use server";
    await requireUser();
    const input = SubmissionSchema.parse({
      name: formData.get("name"),
      area: (formData.get("area") as string) || undefined,
      category: (formData.get("category") as string) || undefined,
      description: formData.get("description"),
    });

    const supabase = await createClient();
    const slug = `${input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 50)}-${randomUUID().slice(0, 6)}`;

    const { error } = await supabase.from("places").insert({
      slug,
      name: input.name,
      area: input.area ?? null,
      category: input.category ?? null,
      description: input.description,
      source: "submitted",
      is_published: false,
    });
    if (error) throw new Error(error.message);
    redirect("/submit?sent=1");
  }

  if (sent) {
    return (
      <main className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
        <p className="voice">Received</p>
        <h1 className="font-display text-3xl">The curators have it.</h1>
        <p className="text-sm leading-relaxed text-ink-dim">
          If it&rsquo;s as good as you say, it goes in the catalog — and your
          taste profile gets the credit when it starts showing up in answers.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="voice">Suggest a place</p>
        <h1 className="font-display text-3xl">Know somewhere we don&rsquo;t?</h1>
        <p className="text-sm leading-relaxed text-ink-dim">
          The catalog is hand-curated. Tell us what it is and why it matters —
          a human reads every one.
        </p>
      </header>

      <form action={submit} className="flex flex-col gap-5">
        <Field label="Name" htmlFor="name">
          <Input id="name" name="name" required minLength={2} maxLength={120} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Area" htmlFor="area">
            <Input id="area" name="area" placeholder="e.g. Shahpur Jat" />
          </Field>
          <Field label="What is it?" htmlFor="category">
            <Input id="category" name="category" placeholder="cafe, dive, dhaba…" />
          </Field>
        </div>
        <Field
          label="Why it matters"
          htmlFor="description"
          hint="What to order, when to go, who it's for."
        >
          <Textarea
            id="description"
            name="description"
            required
            minLength={10}
            maxLength={1000}
            rows={4}
          />
        </Field>
        <Button type="submit" className="self-start">
          Send it in
        </Button>
      </form>
    </main>
  );
}
