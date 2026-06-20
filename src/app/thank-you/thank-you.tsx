"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function ThankYou({
  code,
  shareUrl,
  again,
}: {
  code: string | null;
  shareUrl: string;
  again: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const msg = code
    ? `I just joined the OutsiderMap waitlist - the first 100 outsiders get early access. Use my code ${code}:`
    : "I just joined the OutsiderMap waitlist - the first 100 outsiders get early access.";
  const enc = encodeURIComponent;
  const whatsapp = `https://wa.me/?text=${enc(`${msg} ${shareUrl}`)}`;
  const twitter = `https://twitter.com/intent/tweet?text=${enc(msg)}&url=${enc(shareUrl)}`;
  const telegram = `https://t.me/share/url?url=${enc(shareUrl)}&text=${enc(msg)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked - link is visible to copy manually.
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-5 py-2 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-accent text-night">
        <svg
          width={26}
          height={26}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>

      <p className="voice">{again ? "Already in." : "Application in."}</p>
      <h1 className="font-display text-4xl leading-[1.05] sm:text-5xl">
        {again ? "You're already on the list." : "We'll be in touch."}
      </h1>
      <p className="max-w-sm text-sm leading-relaxed text-ink-dim">
        {again
          ? "One application per person - you're already counted. Move yourself up by getting friends to apply with your code."
          : "We're going through every application by hand. The first 100 outsiders get early access to every spot, every drop, and every area before anyone else sees it."}
      </p>

      {code && (
        <div className="w-full rounded-card border border-line bg-night/40 p-5 text-left">
          <p className="voice mb-2">Your referral code</p>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
            <span className="font-mono text-lg tracking-[0.2em] text-accent">
              {code}
            </span>
            <button
              type="button"
              onClick={copyLink}
              className="shrink-0 text-sm text-ink-dim transition-colors hover:text-ink"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Share label="WhatsApp" href={whatsapp} primary />
            <Share label="X" href={twitter} />
            <Share label="Telegram" href={telegram} />
          </div>

          <p className="mt-4 text-sm text-ink-dim">
            Every friend who applies with your code moves you up the list.
          </p>
        </div>
      )}

      <p className="text-sm text-ink-dim">
        Follow{" "}
        <a
          href="https://instagram.com/outsidermap"
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:underline"
        >
          @outsidermap
        </a>
        . Hidden spots dropping every day until we open.
      </p>
    </div>
  );
}

function Share({
  label,
  href,
  primary = false,
}: {
  label: string;
  href: string;
  primary?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "rounded-full px-4 py-2 text-sm font-medium transition-colors",
        primary
          ? "bg-accent text-night hover:bg-ember"
          : "border border-line text-ink hover:border-ink-dim",
      )}
    >
      {label}
    </a>
  );
}
