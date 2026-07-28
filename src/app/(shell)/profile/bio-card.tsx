"use client";

import { useState } from "react";
import { updateBio } from "./actions";

/**
 * The one free-text identity field: a short bio shown on the member's
 * public profile. Inline edit, no separate settings screen.
 */
export function BioCard({ initial }: { initial: string | null }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <div className="rounded-card border border-line bg-surface p-4">
        <p className="voice">bio</p>
        <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink">
          {initial || <span className="text-ink-dim">Say who you are in a line - it shows on your public profile.</span>}
        </p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-2 rounded-full border border-line px-3 py-1 text-xs text-ink-dim transition-colors hover:text-ink"
        >
          {initial ? "Edit" : "Add bio"}
        </button>
      </div>
    );
  }

  return (
    <form
      action={async (formData) => {
        setSaving(true);
        try {
          await updateBio(formData);
          setEditing(false);
        } finally {
          setSaving(false);
        }
      }}
      className="rounded-card border border-line bg-surface p-4"
    >
      <p className="voice">bio</p>
      <textarea
        name="bio"
        defaultValue={initial ?? ""}
        rows={3}
        maxLength={200}
        autoFocus
        className="mt-1.5 w-full rounded-card border border-line bg-night/40 px-3 py-2 text-sm text-ink outline-none focus:border-accent/60"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-night disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-full border border-line px-4 py-1.5 text-xs text-ink-dim"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
