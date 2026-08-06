"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { captureNativePhoto, isNativeCameraAvailable } from "@/lib/media/camera";
import { saveDisplayName, skipSetupStep } from "./actions";
import { SetupStepShell } from "./step-shell";

/**
 * Name and face.
 *
 * Both fields are usually already filled: handle_new_user copies the OAuth
 * provider's full_name and avatar_url onto the profile at signup, so a member
 * who came in through Google sees their own name and photo here and taps once.
 * That is the visible payoff of wiring Google properly - this screen should
 * feel like a confirmation, not a form.
 *
 * The upload path is the house pattern: ask the server for a signed URL, PUT
 * the bytes straight to Storage, then confirm. The bucket name is a literal
 * here rather than an import because `@/lib/media/avatar` is `server-only`.
 */

/** Kept in step with AvatarIssueSchema's regex and MAX_AVATAR_BYTES. */
const MAX_BYTES = 5 * 1024 * 1024;

function extOf(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (/^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  // A camera capture may arrive with no usable filename; fall back to the MIME
  // subtype, which is what the native seam sets.
  const fromType = file.type.split("/").pop()?.toLowerCase() ?? "";
  return /^[a-z0-9]{2,5}$/.test(fromType) ? fromType : "jpg";
}

export function IdentityStep({
  initialName,
  initialAvatarUrl,
}: {
  initialName: string | null;
  initialAvatarUrl: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(initialName ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [preview, setPreview] = useState<string | null>(null);
  const [nativeCamera, setNativeCamera] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void isNativeCameraAvailable().then((ok) => {
      if (!cancelled) setNativeCamera(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Revoke the object URL when it is replaced or the screen unmounts.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function upload(file: File) {
    if (file.size > MAX_BYTES) {
      setError("That photo is over 5MB. Try a smaller one.");
      return;
    }
    setError(null);
    setUploading(true);
    const localUrl = URL.createObjectURL(file);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return localUrl;
    });

    try {
      const issue = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ext: extOf(file), size: file.size }),
      });
      const issued = (await issue.json()) as {
        path?: string;
        token?: string;
        message?: string;
      };
      if (!issue.ok || !issued.path || !issued.token) {
        throw new Error(issued.message ?? "Couldn't start the upload.");
      }

      const { createClient } = await import("@/lib/supabase/client");
      const { error: uploadError } = await createClient()
        .storage.from("avatars")
        .uploadToSignedUrl(issued.path, issued.token, file);
      if (uploadError) throw new Error("Upload failed - try again.");

      const confirm = await fetch("/api/profile/avatar/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: issued.path }),
      });
      const saved = (await confirm.json()) as {
        avatarUrl?: string;
        message?: string;
      };
      if (!confirm.ok) {
        throw new Error(saved.message ?? "Couldn't save that photo.");
      }
      if (saved.avatarUrl) setAvatarUrl(saved.avatarUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that photo.");
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function shoot() {
    try {
      const file = await captureNativePhoto("prompt");
      if (file) await upload(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the camera.");
    }
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const trimmed = name.trim();
      if (trimmed) {
        const result = await saveDisplayName(trimmed);
        if (!result.ok) {
          setError(result.error);
          return;
        }
      } else {
        // A photo with no name still answers the screen.
        const { ok } = await skipSetupStep("identity");
        if (!ok) {
          setError("Couldn't save that. Try again.");
          return;
        }
      }
      router.refresh();
    });
  }

  function skip() {
    startTransition(async () => {
      // This screen has no column the resolver can fall back on - OAuth
      // prefills both of them - so a silently failed skip would strand the
      // member here with nothing to click.
      const { ok } = await skipSetupStep("identity");
      if (!ok) {
        setError("Couldn't skip that. Try again.");
        return;
      }
      router.refresh();
    });
  }

  const shown = preview ?? avatarUrl;
  const busy = pending || uploading;

  return (
    <SetupStepShell
      id="identity"
      footer={
        <button
          type="button"
          onClick={skip}
          disabled={busy}
          className="text-sm text-ink-dim transition-colors hover:text-ink disabled:opacity-50"
        >
          Skip for now
        </button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-full border border-line bg-raise">
            {shown ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={shown}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              <span className="flex size-full items-center justify-center text-ink-dim">
                <Camera className="size-6" aria-hidden />
              </span>
            )}
            {uploading && (
              <span className="absolute inset-0 flex items-center justify-center bg-night/60">
                <Spinner />
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() =>
                nativeCamera ? void shoot() : fileInput.current?.click()
              }
            >
              {shown ? "Change photo" : "Add a photo"}
            </Button>
            <span className="text-xs text-ink-dim">JPG, PNG or HEIC. 5MB.</span>
          </div>
        </div>

        <Field label="Your name" htmlFor="display-name">
          <Input
            id="display-name"
            autoComplete="name"
            maxLength={60}
            placeholder="What people call you"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
        </Field>

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button onClick={save} disabled={busy} className="self-start">
          {pending ? (
            <Spinner className="border-night/30 border-t-night" />
          ) : null}
          Looks right
        </Button>
      </div>
    </SetupStepShell>
  );
}
