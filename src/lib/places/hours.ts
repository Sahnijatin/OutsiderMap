import { z } from "zod";
import type { Json } from "@/types/database";

/**
 * Opening-hours logic, IST. hours jsonb shape:
 *   { mon: [{ open: "09:00", close: "01:00" }], ... }
 * close <= open means the window runs past midnight.
 */

const WindowSchema = z.object({ open: z.string(), close: z.string() });
const HoursSchema = z.record(z.string(), z.array(WindowSchema));

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Current time in IST regardless of server timezone. */
export function nowInIST(date = new Date()) {
  const ist = new Date(
    date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
  );
  return { day: ist.getDay(), minutes: ist.getHours() * 60 + ist.getMinutes() };
}

export function isOpenAt(hours: Json | null, day: number, minutes: number) {
  const parsed = HoursSchema.safeParse(hours);
  if (!parsed.success) return null; // unknown - don't filter out

  const today = parsed.data[DAY_KEYS[day]] ?? [];
  for (const w of today) {
    const open = toMinutes(w.open);
    const close = toMinutes(w.close);
    if (close > open) {
      if (minutes >= open && minutes < close) return true;
    } else {
      // Overnight window: counts from open until midnight.
      if (minutes >= open) return true;
    }
  }

  // A previous day's overnight window can spill into the small hours.
  const yesterday = parsed.data[DAY_KEYS[(day + 6) % 7]] ?? [];
  for (const w of yesterday) {
    const open = toMinutes(w.open);
    const close = toMinutes(w.close);
    if (close <= open && minutes < close) return true;
  }

  return false;
}

/** true / false / null (unknown hours). */
export function isOpenNow(hours: Json | null, date = new Date()) {
  const { day, minutes } = nowInIST(date);
  return isOpenAt(hours, day, minutes);
}

/** "open till 1:00 am" / "closed · opens 9:00 am" / null when unknown. */
export function openStatusLabel(hours: Json | null, date = new Date()) {
  const parsed = HoursSchema.safeParse(hours);
  if (!parsed.success) return null;
  const { day, minutes } = nowInIST(date);

  const fmt = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    const period = h >= 12 ? "pm" : "am";
    const hour = h % 12 === 0 ? 12 : h % 12;
    return m ? `${hour}:${String(m).padStart(2, "0")}${period}` : `${hour}${period}`;
  };

  const today = parsed.data[DAY_KEYS[day]] ?? [];
  for (const w of today) {
    const open = toMinutes(w.open);
    const close = toMinutes(w.close);
    const within =
      close > open ? minutes >= open && minutes < close : minutes >= open;
    if (within) {
      if (open === 0 && close === 0) return "open 24 hours";
      return `open till ${fmt(w.close)}`;
    }
  }
  const yesterday = parsed.data[DAY_KEYS[(day + 6) % 7]] ?? [];
  for (const w of yesterday) {
    if (toMinutes(w.close) <= toMinutes(w.open) && minutes < toMinutes(w.close)) {
      return `open till ${fmt(w.close)}`;
    }
  }
  const upcoming = today.find((w) => toMinutes(w.open) > minutes);
  if (upcoming) return `closed · opens ${fmt(upcoming.open)}`;
  return "closed for the night";
}
