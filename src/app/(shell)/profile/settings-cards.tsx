"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { unregisterPushNotifications } from "@/lib/native/push";

/**
 * The settings that only needed a UI: the personalization consent switch
 * (PATCH /api/profile), the DPDP account delete (DELETE /api/account,
 * type-to-confirm), and the sign-out form (which also drops this device's push
 * token so a shared phone stops receiving the previous member's notifications).
 */

export function SignOutForm({ action }: { action: () => Promise<void> }) {
  return (
    <form
      action={action}
      // Fire-and-forget: releasing the push token must never block or break
      // signing out. No-op on web.
      onSubmit={() => {
        void unregisterPushNotifications();
      }}
    >
      <button
        type="submit"
        className="text-sm text-ink-dim transition-colors hover:text-ink"
      >
        Sign out
      </button>
    </form>
  );
}

export function PersonalizationToggle({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !enabled;
    setEnabled(next); // optimistic
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personalization_enabled: next }),
      });
      if (!res.ok) setEnabled(!next); // revert
    } catch {
      setEnabled(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-card border border-line bg-surface p-4">
      <div>
        <p className="text-sm font-medium text-ink">Personalized learning</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-dim">
          When on, what you save and complete sharpens your recommendations.
          Off answers from your quiz and the moment only.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={busy}
        onClick={toggle}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full border transition-colors",
          enabled ? "border-accent bg-accent/30" : "border-line bg-raise",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5.5 rounded-full transition-all",
            enabled ? "left-6 bg-accent" : "left-0.5 bg-ink-dim",
          )}
          style={{ width: 22, height: 22 }}
        />
      </button>
    </div>
  );
}

export function DangerZone({ username }: { username: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phrase = username ? `delete @${username}` : "delete my account";

  async function destroy() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) {
        throw new Error(
          "Deletion didn't finish cleanly - contact us and we'll do it by hand.",
        );
      }
      void unregisterPushNotifications();
      const { createClient } = await import("@/lib/supabase/client");
      await createClient()
        .auth.signOut()
        .catch(() => {});
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deletion failed.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card border border-danger/30 p-4">
      <p className="text-sm font-medium text-danger">Danger zone</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-dim">
        Deleting your account erases everything - profile, taste data, quests,
        captures, reels, your number. Gone means gone; numbers are never
        reissued.
      </p>
      {!open ? (
        <Button
          variant="danger"
          size="sm"
          className="mt-3"
          onClick={() => setOpen(true)}
        >
          Delete my account
        </Button>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-xs text-ink-dim">
            Type <span className="font-mono text-danger">{phrase}</span> to
            confirm.
          </p>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoCapitalize="none"
            autoComplete="off"
            placeholder={phrase}
          />
          <div className="flex gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={confirm.trim().toLowerCase() !== phrase || busy}
              onClick={destroy}
            >
              {busy ? <Spinner className="size-4" /> : null}
              Erase everything
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setConfirm("");
              }}
            >
              Keep my account
            </Button>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}
