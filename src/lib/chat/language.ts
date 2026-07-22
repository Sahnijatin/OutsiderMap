/**
 * Light language / register detection for chat (#98). The model understands
 * Hinglish, Devanagari, and typos natively; this doesn't translate anything -
 * it detects the register so we can explicitly tell the agent to reply *in
 * kind* (a real failure mode is answering Hinglish in formal English) and to
 * keep catalog place names exact. Architecture stays language-agnostic: add a
 * token set / script range and a new register drops in.
 */

export type Register = "english" | "hinglish" | "hindi" | "other";
export type Script = "latin" | "devanagari" | "mixed" | "none";

export interface RegisterRead {
  script: Script;
  register: Register;
  /** A steering line for the agent, or "" when plain English needs no nudge. */
  replyHint: string;
}

const DEVANAGARI = /[ऀ-ॿ]/;
const LATIN = /[a-z]/i;

/**
 * High-signal romanized-Hindi tokens. Not exhaustive - just enough that a
 * genuinely Hinglish message trips at least one. Kept lowercase; matched on
 * whole tokens so "hair" doesn't match "hai".
 */
const HINGLISH_TOKENS = new Set([
  "hai",
  "hain",
  "krna",
  "karna",
  "karo",
  "kar",
  "chahiye",
  "mein",
  "mai",
  "mujhe",
  "kya",
  "kyaa",
  "acha",
  "accha",
  "achha",
  "yaar",
  "bhai",
  "dost",
  "khana",
  "khaana",
  "ghar",
  "chalo",
  "chalte",
  "batao",
  "bata",
  "koi",
  "kuch",
  "kuchh",
  "jana",
  "jaana",
  "wala",
  "wali",
  "sasta",
  "mehenga",
  "paise",
  "dhoondh",
  "dhundo",
  "pyaar",
  "saath",
]);

const HINTS: Record<Exclude<Register, "english" | "other">, string> = {
  hinglish:
    "The user is writing in Hinglish (Hindi in Roman script). Reply in the same natural Hinglish register - don't switch to formal English or pure Hindi. Keep place names exactly as they appear in the catalog.",
  hindi:
    "The user is writing in Hindi (Devanagari). Reply in natural Hindi. Keep place names exactly as they appear in the catalog.",
};

export function detectRegister(text: string): RegisterRead {
  const trimmed = text.trim();
  const hasDevanagari = DEVANAGARI.test(trimmed);
  const hasLatin = LATIN.test(trimmed);

  const script: Script = hasDevanagari
    ? hasLatin
      ? "mixed"
      : "devanagari"
    : hasLatin
      ? "latin"
      : "none";

  let register: Register;
  if (hasDevanagari && hasLatin) {
    register = "hinglish"; // code-mixed
  } else if (hasDevanagari) {
    register = "hindi";
  } else if (hasLatin) {
    const tokens = trimmed.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    const hits = tokens.filter((t) => HINGLISH_TOKENS.has(t)).length;
    register = hits >= 1 ? "hinglish" : "english";
  } else {
    register = "other";
  }

  const replyHint =
    register === "hinglish"
      ? HINTS.hinglish
      : register === "hindi"
        ? HINTS.hindi
        : "";

  return { script, register, replyHint };
}
