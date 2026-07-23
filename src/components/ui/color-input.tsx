"use client";

import { useState } from "react";

/**
 * A hex color field: a native swatch picker kept in sync with a text input, so
 * admins can either pick or paste a `#rrggbb`. Only the text input carries the
 * form `name`, so a single value submits.
 */
export function ColorInput({
  id,
  name,
  defaultValue = "#f0a431",
}: {
  id?: string;
  name: string;
  defaultValue?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        aria-label="Pick a color"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-11 w-14 shrink-0 cursor-pointer rounded-xl border border-line bg-surface p-1"
      />
      <input
        id={id}
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        pattern="#[0-9a-fA-F]{6}"
        required
        className="w-32 rounded-xl border border-line bg-surface px-4 py-3 font-mono text-ink focus:border-accent focus:outline-none transition-colors"
      />
    </div>
  );
}
