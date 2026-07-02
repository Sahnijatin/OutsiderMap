import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import type { PlaceKind, Tables } from "@/types/database";
import { PlaceLocation } from "./place-location";
import { StoryEditor } from "./story-editor";
import { deletePlace, upsertPlace } from "./actions";

const CATEGORIES = [
  "cafe", "restaurant", "bar", "club", "street-food", "dessert", "bakery",
  "bookstore", "gallery", "park", "market", "music-venue", "late-night-eats",
  "chai", "experience", "viewpoint",
];

// Experience kinds (places.kind, migration 0006). Keep in sync with PlaceKind.
const KINDS: PlaceKind[] = [
  "spot", "cafe", "nightlife", "workshop", "historical", "cultural", "event",
];

export function PlaceForm({
  place,
  googleMapsApiKey,
}: {
  place?: Tables<"places">;
  googleMapsApiKey: string | null;
}) {
  return (
    <form action={upsertPlace} className="flex max-w-2xl flex-col gap-5">
      {place && <input type="hidden" name="id" value={place.id} />}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" htmlFor="name">
          <Input id="name" name="name" required defaultValue={place?.name} />
        </Field>
        <Field label="Slug" htmlFor="slug" hint="Blank = generated from name">
          <Input id="slug" name="slug" defaultValue={place?.slug} />
        </Field>
        <Field label="Area" htmlFor="area">
          <Input id="area" name="area" defaultValue={place?.area ?? ""} />
        </Field>
        <Field label="Category" htmlFor="category">
          <Select
            id="category"
            name="category"
            defaultValue={place?.category ?? ""}
          >
            <option value="">-</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Kind"
          htmlFor="kind"
          hint="The experience type the app surfaces"
        >
          <Select id="kind" name="kind" defaultValue={place?.kind ?? "spot"}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Price level (1-4)" htmlFor="price_level">
          <Input
            id="price_level"
            name="price_level"
            type="number"
            min={1}
            max={4}
            defaultValue={place?.price_level ?? ""}
          />
        </Field>
        <Field label="Vibe tags" htmlFor="vibe_tags" hint="Comma-separated">
          <Input
            id="vibe_tags"
            name="vibe_tags"
            defaultValue={place?.vibe_tags.join(", ")}
          />
        </Field>
      </div>

      <Field label="Description" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={place?.description ?? ""}
        />
      </Field>
      <Field
        label="Editor's note"
        htmlFor="editor_note"
        hint="The tip a local friend gives"
      >
        <Textarea
          id="editor_note"
          name="editor_note"
          rows={2}
          defaultValue={place?.editor_note ?? ""}
        />
      </Field>

      <PlaceLocation
        token={googleMapsApiKey}
        lat={place?.lat ?? null}
        lng={place?.lng ?? null}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Hours (JSON)"
          htmlFor="hours"
          hint='{"mon":[{"open":"09:00","close":"01:00"}],…}'
        >
          <Textarea
            id="hours"
            name="hours"
            rows={4}
            className="font-mono text-xs"
            defaultValue={place?.hours ? JSON.stringify(place.hours) : ""}
          />
        </Field>
        <Field
          label="Best for (JSON)"
          htmlFor="best_for"
          hint='{"moods":[…],"times":[…],"group":[…]}'
        >
          <Textarea
            id="best_for"
            name="best_for"
            rows={4}
            className="font-mono text-xs"
            defaultValue={place?.best_for ? JSON.stringify(place.best_for) : ""}
          />
        </Field>
      </div>

      <StoryEditor initial={place?.story} />

      <Field
        label="Image"
        htmlFor="image"
        hint={place?.image_path ? `Current: ${place.image_path}` : "Optional"}
      >
        <Input id="image" name="image" type="file" accept="image/*" />
      </Field>

      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          name="is_chain"
          defaultChecked={place?.is_chain ?? false}
          className="size-4 accent-(--color-accent)"
        />
        Chain - never surfaced in recommendations
      </label>

      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          name="is_published"
          defaultChecked={place?.is_published ?? false}
          className="size-4 accent-(--color-accent)"
        />
        Published - visible in the product
      </label>

      <div className="flex items-center gap-4 border-t border-line pt-5">
        <Button type="submit">
          {place ? "Save (re-embeds)" : "Create place"}
        </Button>
        {place && (
          <Button
            type="submit"
            variant="danger"
            size="sm"
            formAction={deletePlace}
            formNoValidate
          >
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}
