"use client";

import { isNativeApp } from "@/lib/capacitor/platform";

/**
 * Sharing with a native path (#143 plugins track; growth loops #123).
 *
 * `navigator.share` doesn't exist in the Android WebView and is patchy in
 * WKWebView, so in the app our share buttons would silently degrade to
 * "copied to clipboard". `@capacitor/share` opens the real OS share sheet.
 *
 * One helper for every share surface: native sheet → Web Share API → clipboard,
 * in that order. The plugin is dynamically imported so it never enters the web
 * bundle.
 */

export type ShareOutcome =
  /** The OS/browser share sheet handled it. */
  | "shared"
  /** No share sheet — the link is on the clipboard instead. */
  | "copied"
  /** The user dismissed the sheet. */
  | "dismissed"
  /** Nothing worked (e.g. clipboard blocked). */
  | "failed";

export type ShareInput = {
  title?: string;
  text?: string;
  url?: string;
};

function clipboardText({ text, url }: ShareInput): string {
  return [text, url].filter(Boolean).join(" ");
}

/**
 * Share via the best available channel. Callers use the return value to decide
 * whether to show a "copied" confirmation.
 */
export async function shareOrCopy(input: ShareInput): Promise<ShareOutcome> {
  const { title, text, url } = input;

  if (await isNativeApp()) {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title, text, url });
      return "shared";
    } catch (e) {
      // Dismissing the sheet rejects — that's a normal outcome, not a failure.
      const msg = e instanceof Error ? e.message : String(e);
      if (/cancel|abort|dismiss/i.test(msg)) return "dismissed";
      // Fall through to the web paths below.
    }
  }

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/abort|cancel/i.test(msg)) return "dismissed";
    }
  }

  try {
    await navigator.clipboard.writeText(clipboardText(input));
    return "copied";
  } catch {
    return "failed";
  }
}
