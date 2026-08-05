"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { unregisterPushNotifications } from "@/lib/native/push";
import { useIsNativeApp } from "@/lib/capacitor/platform";
import { tap as hapticTap } from "@/lib/native/haptics";
import { playSound, startAmbient, stopAmbient } from "@/lib/sound/engine";
import { setSoundPref, useSoundPrefs } from "@/lib/sound/prefs";

/**
 * The settings that only needed a UI: the "Feel" card (sound effects, the
 * ambient night hum, haptics), the personalization consent switch
 * (PATCH /api/profile), the DPDP account delete (DELETE /api/account,
 * type-to-confirm), and the sign-out form (which also drops this device's push
 * token so a shared phone stops receiving the previous member's notifications).
 */

/**
 * How the app feels in the hand. Effects and haptics preview themselves when
 * switched on; the music toggle starts/stops the ambient engine immediately
 * (the click is the user gesture autoplay policies want).
 */
export function FeelCard() {
  const prefs = useSoundPrefs();
  const isNative = useIsNativeApp();

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="text-sm font-medium text-ink">Feel</p>
      <p className="mt-0.5 text-xs leading-relaxed text-ink-dim">
        The small textures. Everything here stays on this device.
      </p>
      <div className="mt-2 flex flex-col">
        <ToggleRow
          label="Sound effects"
          hint="Soft ticks when you send, finish, or earn something."
          checked={prefs.effects}
          onChange={(next) => {
            setSoundPref("effects", next);
            if (next) playSound("tap");
          }}
        />
        <ToggleRow
          label="Background music"
          hint="A very quiet Delhi night hum while you browse."
          checked={prefs.music}
          onChange={(next) => {
            setSoundPref("music", next);
            if (next) startAmbient();
            else stopAmbient();
          }}
        />
        {/* Haptics only exist in the native shell - no dead switch on web. */}
        {isNative && (
          <ToggleRow
            label="Haptics"
            hint="A tick you can feel on meaningful moments."
            checked={prefs.haptics}
            onChange={(next) => {
              setSoundPref("haptics", next);
              if (next) hapticTap();
            }}
          />
        )}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-line/40 py-2 first:border-t-0">
      <div>
        <p className="text-sm text-ink">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-dim">{hint}</p>
      </div>
      {/* The visual track is 28x48; the button pads it to a 44px target. */}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="-mr-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center p-2"
      >
        <span
          className={cn(
            "relative block h-7 w-12 rounded-full border transition-colors",
            checked ? "border-accent bg-accent/30" : "border-line bg-raise",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 block size-[22px] rounded-full transition-all",
              checked ? "left-6 bg-accent" : "left-0.5 bg-ink-dim",
            )}
          />
        </span>
      </button>
    </div>
  );
}

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

/**
 * Per-purpose consent (DPDP §6): one row per thing a member can refuse,
 * replacing the single personalization boolean.
 *
 * Turning something ON is instant. Turning it OFF opens an inline confirm
 * naming exactly what gets deleted, because withdrawal here really does delete
 * things. A typed phrase - the DangerZone treatment - was considered and
 * rejected: that ceremony is right for destroying an account, and on a
 * settings toggle it is theatre that would keep people opted in for the wrong
 * reason.
 */
export function ConsentCard({
  initial,
  purposes,
  memoryCount,
  policyVersion,
  acceptedOn,
}: {
  initial: Record<string, boolean>;
  purposes: {
    purpose: string;
    label: string;
    description: string;
    dataTouched: string[];
  }[];
  memoryCount: number;
  policyVersion: string;
  acceptedOn: string | null;
}) {
  const [granted, setGranted] = useState(initial);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function write(purpose: string, next: boolean) {
    setBusy(true);
    setError(null);
    const previous = granted[purpose] === true;
    setGranted((prev) => ({ ...prev, [purpose]: next })); // optimistic
    try {
      const res = await fetch("/api/consent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose, granted: next }),
      });
      if (!res.ok) {
        setGranted((prev) => ({ ...prev, [purpose]: previous }));
        setError("Couldn't save that. Try again.");
      }
    } catch {
      setGranted((prev) => ({ ...prev, [purpose]: previous }));
      setError("Couldn't save that. Try again.");
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="text-sm font-medium text-ink">What you&rsquo;ve agreed to</p>
      <p className="mt-0.5 text-xs leading-relaxed text-ink-dim">
        Each of these is separate, and each is yours to take back. Turning one
        off deletes what it was holding.
      </p>

      <div className="mt-2 flex flex-col">
        {purposes.map((spec) => {
          const on = granted[spec.purpose] === true;
          const isConfirming = confirming === spec.purpose;
          return (
            <div key={spec.purpose}>
              <ToggleRow
                label={spec.label}
                hint={spec.description}
                checked={on}
                onChange={(next) => {
                  if (busy) return;
                  // Only the destructive direction asks.
                  if (next) void write(spec.purpose, true);
                  else setConfirming(spec.purpose);
                }}
              />
              {isConfirming && (
                <div className="mb-2 rounded-card border border-danger/30 bg-raise p-3">
                  <p className="text-xs leading-relaxed text-ink">
                    Turning this off deletes{" "}
                    {spec.dataTouched.length > 0
                      ? spec.dataTouched.join(", ")
                      : "what this was holding"}
                    {spec.purpose === "personalization" && memoryCount > 0
                      ? ` — including ${memoryCount} remembered ${
                          memoryCount === 1 ? "fact" : "facts"
                        }`
                      : ""}
                    . Your quiz answers stay, so it still answers — just less
                    sharply. This can&rsquo;t be undone.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      variant="danger"
                      disabled={busy}
                      onClick={() => void write(spec.purpose, false)}
                    >
                      {busy ? (
                        <Spinner className="border-night/30 border-t-night" />
                      ) : null}
                      Turn off and delete
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setConfirming(null)}
                    >
                      Keep it on
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <p className="mt-3 border-t border-line/40 pt-3 text-xs leading-relaxed text-ink-dim">
        Running your account is the product itself and can&rsquo;t be switched
        off — deleting your account below is how you withdraw it.{" "}
        {acceptedOn
          ? `You accepted privacy policy version ${policyVersion} on ${acceptedOn}.`
          : `Current privacy policy version: ${policyVersion}.`}{" "}
        <Link href="/privacy" className="underline hover:text-accent">
          Read it
        </Link>
        .
      </p>
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
        captures, posts, your number. Gone means gone; numbers are never
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
