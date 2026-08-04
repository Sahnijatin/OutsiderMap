import { z } from "zod";

/**
 * Username rules, shared by the setup flow and the availability API.
 * Mirrors the DB check constraint on profiles.username exactly - the DB is
 * the final word, this exists for friendly errors before the round-trip.
 */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

/** Names that would confuse support, impersonate the product, or squat routes. */
const RESERVED = new Set([
  "admin",
  "outsider",
  "outsiders",
  "outsidermap",
  "official",
  "support",
  "help",
  "api",
  "map",
  "chat",
  "quests",
  "reels",
  "profile",
  "setup",
  "settings",
  "about",
  "team",
  "blog",
]);

export const UsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    USERNAME_PATTERN,
    "3-20 characters: lowercase letters, numbers, underscores.",
  )
  .refine((u) => !RESERVED.has(u), "That name is reserved.");

/** Format an outsider number the way it appears everywhere: #0042. */
export function formatOutsiderNumber(n: number | null | undefined) {
  if (n == null) return "#----";
  return `#${String(n).padStart(4, "0")}`;
}
