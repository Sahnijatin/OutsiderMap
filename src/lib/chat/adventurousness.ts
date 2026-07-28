import { z } from "zod";

/**
 * The explore/exploit ("adventurousness") dial (#97, DEVELOPMENT.md §5.3).
 * Derived from a user's learned_signals, it tells the agent how much to stretch
 * someone versus play to their established taste - so "you keep picking quiet
 * older places, here's one that fits and one that stretches you" is a decision,
 * not a guess. Pure and deterministic so it's unit-testable and cheap to run.
 */

/** The slice of learned_signals this dial reads. Parsed defensively. */
const LearnedSignalsSchema = z
  .object({
    event_count: z.number().nonnegative().optional(),
    save_rate: z.number().nullable().optional(),
    top_vibes: z
      .array(z.object({ tag: z.string(), score: z.number() }))
      .optional(),
    top_areas: z.array(z.string()).optional(),
  })
  .passthrough();

export type Posture = "explore" | "balanced" | "exploit";

export interface AdventurousnessDial {
  /** 0 = play it safe (exploit), 1 = surprise them (explore). */
  score: number;
  posture: Posture;
  /** One line the agent acts on when choosing how far to stretch. */
  guidance: string;
}

/** Below this many logged events, behaviour is too thin to compute a dial from. */
const COLD_START_EVENTS = 8;

/**
 * The dial's prior, taken from the onboarding quiz.
 *
 * `adventurousness` is extracted on the same 0-1 axis this dial uses ("0 =
 * strict comfort-zone, 1 = actively hunts the unknown"), so it seeds the score
 * directly rather than through a formula.
 */
export interface AdventurousnessPrior {
  adventurousness?: number;
}

/** Used when a member has neither behaviour nor a usable quiz answer. */
const NO_PRIOR_SCORE = 0.65;

const GUIDANCE: Record<Posture, string> = {
  exploit:
    "They have a clear, narrow taste - lead with places squarely in it. At most one gentle stretch, and say why it's a stretch.",
  balanced:
    "Mix familiar with one pick that stretches them a little; name the stretch so it's a choice, not a mismatch.",
  explore:
    "They range widely - it's fine to surprise them. Still ground every pick in what they actually asked for.",
};

function postureFor(score: number): Posture {
  if (score < 0.4) return "exploit";
  if (score > 0.6) return "explore";
  return "balanced";
}

/**
 * Compute the dial from learned_signals, falling back to the quiz while
 * behaviour is thin. Established users tilt toward exploit when their taste is
 * concentrated (one vibe dominates, one area) and toward explore when it's
 * broad.
 *
 * Before there is behaviour to read, the dial used to hand every member the
 * same 0.65/explore - so the period when someone is most likely to judge the
 * product as generic was exactly the period it treated them as a default. The
 * quiz already asked the question directly, on the same 0-1 axis, so the prior
 * seeds the score when it is available.
 *
 * Note the discontinuity at the threshold is unchanged: the last quiz-driven
 * turn and the first behaviour-driven one can disagree. Smoothing that would
 * mean blending the two across the boundary, which changes established members'
 * dials as well - not worth doing without a measurement to check it against.
 */
export function deriveAdventurousness(
  rawSignals: unknown,
  prior?: AdventurousnessPrior | null,
): AdventurousnessDial {
  const parsed = LearnedSignalsSchema.safeParse(rawSignals);
  const signals = parsed.success ? parsed.data : {};
  const eventCount = signals.event_count ?? 0;

  if (eventCount < COLD_START_EVENTS) {
    const quiz = prior?.adventurousness;
    const score =
      typeof quiz === "number" && Number.isFinite(quiz)
        ? Math.min(1, Math.max(0, quiz))
        : NO_PRIOR_SCORE;
    const posture = postureFor(score);
    return { score: Number(score.toFixed(2)), posture, guidance: GUIDANCE[posture] };
  }

  const vibes = signals.top_vibes ?? [];
  const positive = vibes.filter((v) => v.score > 0);
  const totalScore = positive.reduce((sum, v) => sum + v.score, 0);
  const topShare =
    totalScore > 0 ? Math.max(...positive.map((v) => v.score)) / totalScore : 0;
  const distinctVibes = positive.length;
  const areaCount = (signals.top_areas ?? []).length;

  let score = 0.5;
  if (topShare > 0.5) score -= 0.2; // one vibe dominates -> knows what they like
  if (distinctVibes >= 5) score += 0.15; // broad palate
  if (areaCount <= 1) score -= 0.1; // sticks to one corner of the city
  if (areaCount >= 3) score += 0.1; // roams
  score = Math.min(1, Math.max(0, score));

  const posture = postureFor(score);
  return { score: Number(score.toFixed(2)), posture, guidance: GUIDANCE[posture] };
}
