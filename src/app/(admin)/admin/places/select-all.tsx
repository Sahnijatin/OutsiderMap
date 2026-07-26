"use client";

import { useRef } from "react";

/**
 * Header checkbox that toggles every row checkbox in the surrounding form.
 * Plain DOM on purpose: the rows are server-rendered and the form posts to a
 * server action, so the only client behaviour needed is "check them all".
 */
export function SelectAllCheckbox() {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label="Select all places on this page"
      className="size-4 accent-accent"
      onChange={(event) => {
        const form = ref.current?.form;
        if (!form) return;
        const boxes = form.querySelectorAll<HTMLInputElement>(
          'input[type="checkbox"][name="ids"]',
        );
        for (const box of boxes) box.checked = event.target.checked;
      }}
    />
  );
}
