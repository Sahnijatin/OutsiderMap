"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import type { MemoryKind } from "@/types/database";

/**
 * What the concierge has written down about you, and the button that unwrites
 * it.
 *
 * A system that remembers things you said in passing is either attentive or
 * creepy, and the difference is entirely whether you can see the list. So this
 * shows every live fact verbatim - the same strings that go into the prompt,
 * not a friendly paraphrase of them - and lets any of them be struck off.
 *
 * There is deliberately no way to add or edit one. A row is a record of what
 * the system inferred from something you actually said; a record you can write
 * yourself is not evidence of anything, and one you can rewrite in place is
 * worse, because it looks like evidence and is not.
 */

export interface MemoryRow {
  id: string;
  kind: MemoryKind;
  text: string;
}

/** Plain words. "constraint" is schema vocabulary, not something to show. */
const KIND_LABELS: Record<MemoryKind, string> = {
  constraint: "Never break",
  dislike: "Avoids",
  company: "Goes out with",
  occasion: "Regularly",
  budget: "Really spends",
  access: "Gets around",
};

export function MemoryCard({ initial }: { initial: MemoryRow[] }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function forget(id: string) {
    setBusy(id);
    try {
      const res = await fetch("/api/memory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      // Only drop it from the list once the server agrees. A row that
      // disappears and comes back on refresh is the exact opposite of the
      // reassurance this card exists to give.
      if (res.ok) setRows((r) => r.filter((m) => m.id !== id));
    } catch {
      // Offline or a blip - the row stays, and tapping again retries.
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-line bg-surface p-4">
        <p className="text-sm font-medium text-ink">What the concierge remembers</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-dim">
          Nothing yet. Tell it something in chat that stays true - that you
          don&apos;t eat meat, that rooftops aren&apos;t your thing, that you
          mostly go out with your partner - and it will stop asking.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="text-sm font-medium text-ink">What the concierge remembers</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-dim">
        Picked up from things you said in chat. Remove anything that is wrong or
        that you would rather it forgot.
      </p>
      <ul className="mt-3 flex flex-col gap-1.5">
        {rows.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between gap-3 rounded-xl bg-raise px-3 py-2"
          >
            <span className="min-w-0 text-sm text-ink">
              <span className="text-ink-dim">{KIND_LABELS[m.kind]}: </span>
              {m.text}
            </span>
            <button
              type="button"
              aria-label={`Forget: ${m.text}`}
              disabled={busy === m.id}
              onClick={() => forget(m.id)}
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-ink-dim transition-colors hover:bg-surface hover:text-ink disabled:opacity-50"
            >
              {busy === m.id ? <Spinner className="size-3.5" /> : <X className="size-3.5" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
