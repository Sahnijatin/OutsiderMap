"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  formatOutsiderNumber,
  USERNAME_PATTERN,
} from "@/lib/identity/username";
import { claimUsername } from "./actions";

type Availability = "idle" | "checking" | "free" | "taken" | "invalid";

// available: null = lookup failed; the claim action is the source of truth.
type Checked = { name: string; available: boolean | null } | null;

export function UsernameStep({
  outsiderNumber,
}: {
  outsiderNumber: number | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [checked, setChecked] = useState<Checked>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const normalized = value.trim().toLowerCase();

  // Debounced availability lookup; all state writes happen inside the timer
  // callback, and the render derives the display state below.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!normalized || !USERNAME_PATTERN.test(normalized)) return;
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/profile/username?u=${encodeURIComponent(normalized)}`,
        );
        if (!res.ok) throw new Error();
        const body = (await res.json()) as { available: boolean };
        setChecked({ name: normalized, available: body.available });
      } catch {
        // Advisory only - fall through to a neutral state so the claim
        // button still works when the lookup itself is down.
        setChecked({ name: normalized, available: null });
      }
    }, 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [normalized]);

  const availability: Availability = !normalized
    ? "idle"
    : !USERNAME_PATTERN.test(normalized)
      ? "invalid"
      : checked?.name === normalized
        ? checked.available === null
          ? "idle"
          : checked.available
            ? "free"
            : "taken"
        : "checking";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await claimUsername(normalized);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Server component re-renders into the quiz step.
      router.refresh();
    });
  }

  return (
    <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-6 py-10">
      <div className="flex flex-col gap-3">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
          outsider {formatOutsiderNumber(outsiderNumber)}
        </span>
        <h1 className="font-display text-3xl italic">
          That number is yours. Forever.
        </h1>
        <p className="text-sm text-ink-dim">
          Now pick the name that goes with it. Lowercase, no spaces - and
          choose carefully, it&rsquo;s one shot.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor="username" className="sr-only">
          Username
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-mono text-sm text-ink-dim">
            @
          </span>
          <Input
            id="username"
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={20}
            placeholder="your_name"
            className="pl-9 font-mono lowercase"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
          />
        </div>

        <p className="min-h-5 text-xs" aria-live="polite">
          {availability === "checking" && (
            <span className="text-ink-dim">Checking&hellip;</span>
          )}
          {availability === "free" && (
            <span className="text-accent">@{normalized} is free.</span>
          )}
          {availability === "taken" && (
            <span className="text-danger">@{normalized} is taken.</span>
          )}
          {availability === "invalid" && normalized.length > 0 && (
            <span className="text-ink-dim">
              3-20 characters: lowercase letters, numbers, underscores.
            </span>
          )}
        </p>

        <Button
          type="submit"
          disabled={
            pending ||
            availability === "taken" ||
            !USERNAME_PATTERN.test(normalized)
          }
        >
          {pending ? (
            <Spinner className="border-night/30 border-t-night" />
          ) : null}
          Claim it
        </Button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </div>
  );
}
