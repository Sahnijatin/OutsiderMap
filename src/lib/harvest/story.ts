import "server-only";

/**
 * Story-signal extraction (ported from scout-engine): sentences in real
 * reviews that carry lore - speciality, origin, heritage, craft, vibe -
 * quoted with their source. Evidence for the reviewer, never invented copy.
 */

export type StorySignal = { tag: string; quote: string; source: string };
export type Passage = { text: string; source: string };

const SIGNAL_PATTERNS: Array<{ tag: string; re: RegExp }> = [
  { tag: "speciality", re: /\b(famous for|known for|must[- ]try|signature|best [a-z]+ in|their [a-z]+ is (?:legendary|unmatched|the best))\b/i },
  { tag: "origin", re: /\b(since (?:19|20)\d{2}|started (?:in|as)|founded|opened (?:in|back)|(?:19|20)\d{2} se|originally)\b/i },
  { tag: "heritage", re: /\b(generations?|family[- ]run|grandfather|father'?s recipe|secret recipe|institution|iconic|oldest)\b/i },
  { tag: "craft", re: /\b(wood[- ]fired|hand[- ]?made|house[- ]?made|slow[- ]cooked|charcoal|clay oven|sourdough|single[- ]origin|small[- ]batch|imported)\b/i },
  { tag: "vibe", re: /\b(hidden|tucked away|hole[- ]in[- ]the[- ]wall|courtyard|rooftop|terrace|no[- ]frills|queue|line out|always packed)\b/i },
];

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20 && s.length <= 320);
}

export function extractStorySignals(passages: Passage[]): StorySignal[] {
  const signals: StorySignal[] = [];
  const seenSentences = new Set<string>();
  for (const passage of passages) {
    if (!passage?.text) continue;
    for (const sentence of sentences(passage.text)) {
      const key = sentence.toLowerCase().slice(0, 100);
      if (seenSentences.has(key)) continue;
      seenSentences.add(key);
      for (const { tag, re } of SIGNAL_PATTERNS) {
        if (!re.test(sentence)) continue;
        signals.push({ tag, quote: sentence, source: passage.source });
        break;
      }
    }
  }
  const byTag = new Map<string, StorySignal>();
  for (const s of signals) if (!byTag.has(s.tag)) byTag.set(s.tag, s);
  const primary = [...byTag.values()];
  const rest = signals.filter((s) => !primary.includes(s));
  return [...primary, ...rest].slice(0, 8);
}

/** Normalized identity for merging sightings of one physical place. */
export function mergeKey(name: string, citySlug: string): string {
  const norm = name
    .toLowerCase()
    .replace(/\b(the|cafe|café|restaurant|bar|kitchen|house)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
  return `${citySlug}:${norm || name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
