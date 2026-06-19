import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import type { Tables } from "@/types/database";
import { deleteEvent, upsertEvent } from "./actions";

/** ISO → the IST wall-clock value datetime-local expects. */
function isoToIstLocal(iso: string | null) {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 5.5 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 16);
}

export function EventForm({ event }: { event?: Tables<"events"> }) {
  return (
    <form action={upsertEvent} className="flex max-w-2xl flex-col gap-5">
      {event && <input type="hidden" name="id" value={event.id} />}

      <Field label="Title" htmlFor="title">
        <Input id="title" name="title" required defaultValue={event?.title} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Venue" htmlFor="venue_name">
          <Input
            id="venue_name"
            name="venue_name"
            defaultValue={event?.venue_name ?? ""}
          />
        </Field>
        <Field label="Area" htmlFor="area">
          <Input id="area" name="area" defaultValue={event?.area ?? ""} />
        </Field>
        <Field label="Starts (IST)" htmlFor="starts_at">
          <Input
            id="starts_at"
            name="starts_at"
            type="datetime-local"
            required
            defaultValue={isoToIstLocal(event?.starts_at ?? null)}
          />
        </Field>
        <Field label="Ends (IST, optional)" htmlFor="ends_at">
          <Input
            id="ends_at"
            name="ends_at"
            type="datetime-local"
            defaultValue={isoToIstLocal(event?.ends_at ?? null)}
          />
        </Field>
        <Field label="Vibe tags" htmlFor="vibe_tags" hint="Comma-separated">
          <Input
            id="vibe_tags"
            name="vibe_tags"
            defaultValue={event?.vibe_tags.join(", ")}
          />
        </Field>
        <Field label="Ticket / RSVP URL" htmlFor="ticket_url">
          <Input
            id="ticket_url"
            name="ticket_url"
            type="url"
            defaultValue={event?.ticket_url ?? ""}
          />
        </Field>
        <Field
          label="Access"
          htmlFor="required_tier"
          hint="Premium events are invisible to free users (teased only)"
        >
          <Select
            id="required_tier"
            name="required_tier"
            defaultValue={event?.required_tier ?? "free"}
          >
            <option value="free">free - everyone</option>
            <option value="premium">premium - members only</option>
          </Select>
        </Field>
      </div>

      <Field label="Description" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={event?.description ?? ""}
        />
      </Field>

      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="is_underground"
            defaultChecked={event?.is_underground ?? false}
            className="size-4 accent-(--color-under)"
          />
          Underground - editorial flavor, shows the violet badge
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="is_published"
            defaultChecked={event?.is_published ?? false}
            className="size-4 accent-(--color-accent)"
          />
          Published - visible in the product
        </label>
      </div>

      <div className="flex items-center gap-4 border-t border-line pt-5">
        <Button type="submit">{event ? "Save event" : "Create event"}</Button>
        {event && (
          <Button
            type="submit"
            variant="danger"
            size="sm"
            formAction={deleteEvent}
            formNoValidate
          >
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}
