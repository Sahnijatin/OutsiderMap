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

const PRICE_GLYPHS = ["₹", "₹₹", "₹₹₹", "₹₹₹₹"] as const;

/** Renders price_level (1-4) as rupee glyphs. */
export function priceGlyph(level: number | null | undefined) {
  if (!level || level < 1 || level > 4) return "";
  return PRICE_GLYPHS[level - 1];
}
