"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { downscaleImage } from "@/lib/media/downscale";

/**
 * File input that shrinks the photo before the form is submitted.
 *
 * The admin form posts through a Server Action, and a Server Action request
 * body is capped well below the size of a modern phone photo. Raising the cap
 * only moves the wall (Vercel stops at 4.5MB regardless), so the file itself
 * has to get smaller. Swapping the selected file for a downscaled one means
 * the plain `<form action={...}>` keeps working with no upload plumbing.
 */
export function PhotoInput({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const [note, setNote] = useState<string | null>(null);

  return (
    <>
      <Input
        id={id}
        name={name}
        type="file"
        accept="image/*"
        onChange={async (e) => {
          const input = e.currentTarget;
          const file = input.files?.[0];
          if (!file) {
            setNote(null);
            return;
          }

          const smaller = await downscaleImage(file);
          if (smaller !== file) {
            // Replace the selection so the form submits the smaller file.
            const dt = new DataTransfer();
            dt.items.add(smaller);
            input.files = dt.files;
          }
          const mb = (smaller.size / 1024 / 1024).toFixed(1);
          setNote(
            smaller === file
              ? `${mb}MB - sending as is`
              : `Resized to ${mb}MB for upload`,
          );
        }}
      />
      {note && <p className="mt-1 text-xs text-ink-dim">{note}</p>}
    </>
  );
}
