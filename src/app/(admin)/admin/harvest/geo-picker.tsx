"use client";

import { useState } from "react";

export type GeoPickerState = {
  slug: string;
  name: string;
  cities: Array<{ slug: string; name: string; custom?: boolean }>;
};

/**
 * State -> cities picker for the harvest form. Renders inside the server
 * form: the select and checkboxes submit as ordinary form fields. Changing
 * state remounts the city list so stale checks never ride along.
 */
export function GeoPicker({ states }: { states: GeoPickerState[] }) {
  const [stateSlug, setStateSlug] = useState(states[0]?.slug ?? "");
  const active = states.find((s) => s.slug === stateSlug) ?? states[0];

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="voice">state</span>
        <select
          name="state"
          value={stateSlug}
          onChange={(e) => setStateSlug(e.target.value)}
          className="w-64 rounded-card border border-line bg-surface px-3 py-2 text-sm"
        >
          {states.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <div key={active?.slug ?? "none"}>
        <p className="voice">cities</p>
        <div className="mt-2 flex flex-wrap gap-3">
          {(active?.cities ?? []).map((c, i) => (
            <label key={c.slug} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                name="cities"
                value={c.slug}
                defaultChecked={i === 0}
              />
              {c.name}
              {c.custom && <span className="text-xs text-ink-dim">(added)</span>}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
