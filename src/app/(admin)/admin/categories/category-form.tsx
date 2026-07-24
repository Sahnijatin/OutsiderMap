import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ColorInput } from "@/components/ui/color-input";
import type { Tables } from "@/types/database";
import { deleteCategory, upsertCategory } from "./actions";

export function CategoryForm({
  category,
}: {
  category?: Tables<"map_categories">;
}) {
  return (
    <form action={upsertCategory} className="flex max-w-xl flex-col gap-5">
      {category && <input type="hidden" name="id" value={category.id} />}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Label" htmlFor="label" hint="Shown in the map legend">
          <Input
            id="label"
            name="label"
            required
            defaultValue={category?.label}
          />
        </Field>
        <Field label="Slug" htmlFor="slug" hint="lowercase · a–z 0–9 -">
          <Input
            id="slug"
            name="slug"
            required
            pattern="[a-z0-9-]{1,40}"
            defaultValue={category?.slug}
          />
        </Field>
        <Field label="Color" htmlFor="color" hint="Pin dot + legend swatch">
          <ColorInput
            id="color"
            name="color"
            defaultValue={category?.color ?? "#f0a431"}
          />
        </Field>
        <Field label="Sort order" htmlFor="sort_order" hint="Lower shows first">
          <Input
            id="sort_order"
            name="sort_order"
            type="number"
            min={0}
            max={999}
            defaultValue={category?.sort_order ?? 0}
          />
        </Field>
      </div>

      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={category?.is_active ?? true}
          className="size-4 accent-(--color-accent)"
        />
        Active - shown on the map and legend
      </label>

      <div className="flex items-center gap-4 border-t border-line pt-5">
        <Button type="submit">
          {category ? "Save category" : "Create category"}
        </Button>
        {category && (
          <Button
            type="submit"
            variant="danger"
            size="sm"
            formAction={deleteCategory}
            formNoValidate
          >
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}
