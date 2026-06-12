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

const PRICE_GLYPHS = ["₹", "₹₹", "₹₹₹", "₹₹₹₹"] as const;

/** Renders price_level (1–4) as rupee glyphs. */
export function priceGlyph(level: number | null | undefined) {
  if (!level || level < 1 || level > 4) return "";
  return PRICE_GLYPHS[level - 1];
}
