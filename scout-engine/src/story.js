/**
 * Story-signal extraction: the difference between "a pizza place, 4.4 stars"
 * and "the wood-fired oven came from Naples in 2009". Reviews, editorial
 * summaries, and descriptions get scanned for sentences that carry lore -
 * speciality, origin, age, family, ritual - and those sentences ride into the
 * verification sheet as quoted evidence with their source attached.
 *
 * This is evidence collection, not writing: the human verifier and (later)
 * the product's editorial pass turn signals into the story the concierge
 * tells. Nothing here is invented.
 */

const SIGNAL_PATTERNS = [
  { tag: "speciality", re: /\b(famous for|known for|must[- ]try|signature|best [a-z]+ in|their [a-z]+ is (?:legendary|unmatched|the best))\b/i },
  { tag: "origin", re: /\b(since (?:19|20)\d{2}|started (?:in|as)|founded|opened (?:in|back)|(?:19|20)\d{2} se|originally)\b/i },
  { tag: "heritage", re: /\b(generations?|family[- ]run|grandfather|father'?s recipe|secret recipe|institution|iconic|oldest)\b/i },
  { tag: "craft", re: /\b(wood[- ]fired|hand[- ]?made|house[- ]?made|slow[- ]cooked|charcoal|clay oven|sourdough|single[- ]origin|small[- ]batch|imported)\b/i },
  { tag: "vibe", re: /\b(hidden|tucked away|hole[- ]in[- ]the[- ]wall|courtyard|rooftop|terrace|no[- ]frills|queue|line out|always packed)\b/i },
];

/** Split prose into rough sentences without losing short punchy ones. */
function sentences(text) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20 && s.length <= 320);
}

/**
 * @param {Array<{text: string, source: string}>} passages
 * @returns {Array<{tag: string, quote: string, source: string}>} deduped, capped
 */
export function extractStorySignals(passages) {
  const signals = [];
  const seenSentences = new Set();
  for (const passage of passages) {
    if (!passage?.text) continue;
    for (const sentence of sentences(passage.text)) {
      // Sentence-level dedupe FIRST: merged sightings duplicate passages, and
      // a repeated sentence must not re-enter under a different tag.
      const key = sentence.toLowerCase().slice(0, 100);
      if (seenSentences.has(key)) continue;
      seenSentences.add(key);
      for (const { tag, re } of SIGNAL_PATTERNS) {
        if (!re.test(sentence)) continue;
        signals.push({ tag, quote: sentence, source: passage.source });
        break; // one tag per sentence is enough
      }
    }
  }
  // Diverse before deep: one of each tag first, then the rest, cap at 8.
  const byTag = new Map();
  for (const s of signals) {
    if (!byTag.has(s.tag)) byTag.set(s.tag, s);
  }
  const primary = [...byTag.values()];
  const rest = signals.filter((s) => !primary.includes(s));
  return [...primary, ...rest].slice(0, 8);
}
