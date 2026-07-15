import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Chat" };

/** Sprint 2 surface. Until then, Right Now covers the ask. */
export default function ChatStubPage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-4 px-6 pb-24 text-center">
      <div className="halo absolute inset-0" />
      <p className="voice relative">coming in days, not months</p>
      <h1 className="relative max-w-sm font-display text-3xl italic">
        A friend who always knows where to go.
      </h1>
      <p className="relative max-w-sm text-sm text-ink-dim">
        The full conversation is being built right now. Meanwhile, Right Now
        already answers one question well: &ldquo;what do I do tonight?&rdquo;
      </p>
      <ButtonLink href="/now" className="relative mt-2">
        Ask Right Now
      </ButtonLink>
    </main>
  );
}
