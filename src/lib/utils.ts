/** Joins class names, skipping falsy values. */
export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/** Formats a date as e.g. "Fri 13 Jun". */
export function formatDay(date: Date) {
  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
}

/** Formats an event timestamp as e.g. "Fri 13 Jun, 9:30 pm" (IST). */
export function formatEventTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

/** Formats a timestamp relative to now: "just now", "4h ago", "3d ago". */
export function formatRelativeTime(iso: string, now = Date.now()) {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 60) return "just now";
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "always", style: "narrow" });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 30) return rtf.format(-days, "day");
  const months = Math.round(days / 30);
  return rtf.format(-months, "month");
}

const PRICE_GLYPHS = ["₹", "₹₹", "₹₹₹", "₹₹₹₹"] as const;

/** Renders price_level (1-4) as rupee glyphs. */
export function priceGlyph(level: number | null | undefined) {
  if (!level || level < 1 || level > 4) return "";
  return PRICE_GLYPHS[level - 1];
}
