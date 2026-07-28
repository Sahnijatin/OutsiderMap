/**
 * The house voice, as data.
 *
 * These lists are rendered into the system prompt AND checked by the eval
 * harness. They live in their own module - with no `server-only` import - so
 * both sides read the same source: a banned phrase that gets softened in the
 * prompt but stays in the eval (or vice versa) is exactly the drift that makes
 * a voice regression invisible.
 *
 * Note the division of labour with `sanitize.ts`: that module strips what the
 * UI cannot render (markdown, em dashes) because those are safe to remove
 * mechanically. Vocabulary and tone are not - cutting "hidden gem" out of a
 * sentence leaves a hole - so they stay the prompt's job, and this file exists
 * to make the prompt's job measurable rather than hoped-for.
 */

/**
 * A phrase the concierge must never use.
 *
 * `phrase` is the literal string shown to the model. `detect` is present only
 * where the phrase is a *template* rather than something that appears verbatim
 * ("whether you're X or Y" is a shape, not a string), so the eval needs a
 * pattern to find real instances of it.
 */
export interface BannedPhrase {
  phrase: string;
  detect?: RegExp;
}

export const BANNED_PHRASES: readonly BannedPhrase[] = [
  { phrase: "vibrant" },
  { phrase: "bustling" },
  { phrase: "nestled" },
  { phrase: "hidden gem" },
  { phrase: "must-visit" },
  { phrase: "delightful" },
  { phrase: "look no further" },
  {
    phrase: "whether you're X or Y",
    detect: /whether you(?:'|’)re\b[^.?!]{1,60}\bor\b/i,
  },
  { phrase: "You can track it easily" },
];

/** The banned list as the prompt renders it: `"vibrant", "bustling", ...`. */
export function bannedPhraseList(): string {
  return BANNED_PHRASES.map((b) => `"${b.phrase}"`).join(", ");
}

/**
 * Ways a reply can narrate the member's profile back at them ("as someone who
 * loves hole-in-the-wall spots, you'll enjoy..."). This is the failure mode the
 * always-on persona block risks introducing, and it reads worse than generic
 * copy: generic *and* like the product is reading a file on you.
 *
 * Deliberately anchored on second-person attribution, not on taste words - a
 * reply is free to say "late-night" or "hole-in-the-wall" about a *place*. What
 * it must not do is explain the person to themselves.
 *
 * These patterns are a floor, not a ceiling. Six regexes will miss phrasings
 * nobody anticipated, so the eval reports the rate as a trend and the first
 * live run still needs a human reading the actual replies.
 */
export const RECITATION_PATTERNS: readonly RegExp[] = [
  /\bas someone who\b/i,
  /\byou(?:'|’)re someone who\b/i,
  /\b(?:since|because|as|given) you (?:love|like|prefer|enjoy|tend|usually|always|often)\b/i,
  /\b(?:since|because) you(?:'|’)ve been\b/i,
  // Narrowed deliberately: a bare "given your ..." catches legitimate replies
  // that lean on the *ask* ("given your budget of 200"), which is not
  // recitation. Only profile-shaped objects count.
  /\bgiven your (?:taste|profile|history|usual|love|preference|habit)/i,
  /\bbased on your (?:taste|profile|history|preferences|past)\b/i,
  /\bknowing (?:you|your taste)\b/i,
  /\byour usual\b/i,
  /\bfits your (?:taste|vibe|profile|style)\b/i,
  /\bright up your (?:alley|street)\b/i,
  /\btrue to (?:form|type)\b/i,
];
