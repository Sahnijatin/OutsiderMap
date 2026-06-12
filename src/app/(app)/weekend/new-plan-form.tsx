"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { createPlan } from "./actions";

export function NewPlanForm({ defaultWeekend }: { defaultWeekend: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createPlan(formData);
      } catch (e) {
        // redirect() throws internally; let Next handle its own control flow.
        if (e && typeof e === "object" && "digest" in e) throw e;
        setError(
          e instanceof Error
            ? e.message
            : "Plan generation failed. Try again in a moment.",
        );
      }
    });
  }

  if (pending) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-card border border-line bg-surface p-10 text-center">
        <Spinner className="size-6" />
        <p className="voice">Composing your weekend</p>
        <p className="max-w-sm text-sm text-ink-dim">
          Reading your profile, checking the candidates, arguing about
          Saturday night. About thirty seconds.
        </p>
      </div>
    );
  }

  return (
    <form
      action={submit}
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6"
    >
      <input type="hidden" name="weekend_start" value={defaultWeekend} />
      <label htmlFor="brief" className="text-sm text-ink">
        Anything this weekend should be?{" "}
        <span className="text-ink-dim">(optional)</span>
      </label>
      <Input
        id="brief"
        name="brief"
        maxLength={500}
        placeholder="low-key, out-of-towner visiting, big saturday, broke till payday…"
      />
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="budget" className="text-sm text-ink-dim">
            Budget ceiling
          </label>
          <Select id="budget" name="budget" defaultValue="" className="w-44">
            <option value="">No ceiling</option>
            <option value="1">₹ — street level</option>
            <option value="2">₹₹ — easy</option>
            <option value="3">₹₹₹ — a proper night</option>
          </Select>
        </div>
        <Button type="submit">Plan my weekend</Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
