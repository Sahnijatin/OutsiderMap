"use client";

import { Camera, Check } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { success, tap, warn } from "@/lib/native/haptics";

/**
 * "Add a photo" on a place.
 *
 * The catalog has almost no pictures, and the only honest way to fix that at
 * this scale is the people standing in the room. So this is deliberately one
 * tap from the gallery: pick or shoot, and it uploads straight to Storage
 * through a signed URL without the file passing through our server.
 *
 * It tells the truth about what happens next. A photo is screened before it
 * goes public, which today usually means a short wait, and a contributor who
 * is told "live now" and then cannot find their photo will not send a second
 * one.
 */
export function AddPlacePhoto({ slug }: { slug: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "busy" | "done" | "pending">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setState("busy");
    try {
      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();

      const issued = await fetch(`/api/places/${slug}/photos`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ext, size: file.size }),
      });
      const issue = await issued.json().catch(() => null);
      if (!issued.ok) throw new Error(issue?.message ?? "Could not start upload.");

      const { createClient } = await import("@/lib/supabase/client");
      const { error: uploadError } = await createClient()
        .storage.from("place-images")
        .uploadToSignedUrl(issue.path, issue.token, file);
      if (uploadError) {
        throw new Error("Upload failed - try again on better signal.");
      }

      const confirmed = await fetch(`/api/places/${slug}/photos/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: issue.path }),
      });
      const result = await confirmed.json().catch(() => null);
      if (!confirmed.ok) throw new Error(result?.message ?? "Could not save that.");

      success();
      setState(result?.status === "published" ? "done" : "pending");
    } catch (err) {
      warn();
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("idle");
    }
  }

  if (state === "done" || state === "pending") {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-accent">
        <Check className="size-3.5" />
        {state === "done"
          ? "Added - thank you."
          : "Got it. We check new photos before they go live."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset so picking the same file twice still fires a change.
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
      <Button
        variant="secondary"
        size="sm"
        disabled={state === "busy"}
        onClick={() => {
          tap();
          inputRef.current?.click();
        }}
      >
        {state === "busy" ? (
          <Spinner className="border-ink/30 border-t-ink" />
        ) : (
          <Camera className="size-4" />
        )}
        {state === "busy" ? "Adding" : "Add a photo"}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
