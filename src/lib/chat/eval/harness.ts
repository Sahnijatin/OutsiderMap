import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { embedTaste } from "@/lib/taste/profile";
import { runChatTurn, type ChatPickCard } from "@/lib/chat/engine";
import { withTimeout } from "@/lib/ai/retry";
import { EVAL_SCENARIOS, type EvalScenario } from "@/lib/chat/eval/scenarios";
import {
  EVAL_PERSONAS,
  personaEmail,
  personaTokens,
  personaUserId,
  type EvalPersona,
} from "@/lib/chat/eval/personas";
import {
  bannedPhrasesIn,
  modelReasonShare,
  pickOverlap,
  reasonSpecificity,
  recitationRate,
} from "@/lib/chat/eval/metrics";
import type { Database, Json } from "@/types/database";

/**
 * The live personalization eval (plan step 1) - the harness the comment at
 * `eval/scenarios.ts` has been promising and that has never existed.
 *
 * It runs every persona against every scenario through the real
 * {@link runChatTurn}, then asks the only question that matters for this round:
 * do members with opposite taste get different answers?
 *
 * ## This writes to the database it is pointed at
 *
 * Personas need rows in `taste_profiles`, which foreign-keys to `profiles`,
 * which foreign-keys to `auth.users` - so there is no way to evaluate the real
 * engine without creating real auth users. Guards, in order:
 *
 *  - refuses to run unless `CHAT_EVAL_LIVE` is set;
 *  - every account uses a reserved `@outsidermap.invalid` address (RFC 2606),
 *    which can never route mail or collide with a real member;
 *  - user ids are derived deterministically from the persona id, so re-running
 *    updates the same six rows instead of accumulating junk;
 *  - {@link teardownPersonas} deletes only ids this module derives.
 *
 * Point it at a staging or local database. It is a nightly job, not a
 * per-commit one: a full matrix is `personas x scenarios` real agent turns.
 */

/** Per-cell ceiling, matching the chat route's own turn budget. */
const CELL_TIMEOUT_MS = 60_000;

/** Concurrent turns. Kept low - each cell is a multi-step agent loop. */
const DEFAULT_CONCURRENCY = 4;

function assertLiveEval(): void {
  if (!process.env.CHAT_EVAL_LIVE) {
    throw new Error(
      "The live chat eval creates auth users and writes taste profiles. " +
        "Set CHAT_EVAL_LIVE=1 and point at a staging or local database.",
    );
  }
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/**
 * Create (or refresh) the persona's account and taste profile.
 *
 * The taste embedding is generated for real via {@link embedTaste}: before the
 * persona block exists, the blended taste vector is the *only* channel through
 * which these personas can differ at all, so leaving it null would hand step 1
 * a baseline that looks personalized for a reason unrelated to the product.
 */
async function seedPersona(
  admin: SupabaseClient<Database>,
  persona: EvalPersona,
): Promise<string> {
  const userId = personaUserId(persona);

  const { data: existing } = await admin.auth.admin.getUserById(userId);
  if (!existing?.user) {
    const { error } = await admin.auth.admin.createUser({
      id: userId,
      email: personaEmail(persona),
      email_confirm: true,
      user_metadata: { eval_persona: persona.id },
    });
    if (error) {
      throw new Error(
        `seeding persona "${persona.id}" failed: ${error.message}`,
      );
    }
  }

  // `handle_new_user` creates the profile row on signup; fill in what chat reads.
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      display_name: persona.displayName,
      home_city: "delhi",
      personalization_enabled: true,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (profileError) {
    throw new Error(
      `seeding persona "${persona.id}" profile failed: ${profileError.message}`,
    );
  }

  const embedding = await embedTaste(persona.dimensions);
  const { error: tasteError } = await admin.from("taste_profiles").upsert(
    {
      user_id: userId,
      quiz_answers: { version: 2, dimensions: persona.dimensions } as Json,
      learned_signals: (persona.learnedSignals ?? {}) as Json,
      taste_summary: persona.tasteSummary,
      embedding: JSON.stringify(embedding),
    },
    { onConflict: "user_id" },
  );
  if (tasteError) {
    throw new Error(
      `seeding persona "${persona.id}" taste profile failed: ${tasteError.message}`,
    );
  }

  return userId;
}

export async function seedPersonas(
  admin: SupabaseClient<Database>,
  personas: readonly EvalPersona[] = EVAL_PERSONAS,
): Promise<Map<string, string>> {
  assertLiveEval();
  const ids = new Map<string, string>();
  // Serial on purpose: six accounts, and a clear error beats a fast one here.
  for (const persona of personas) {
    ids.set(persona.id, await seedPersona(admin, persona));
  }
  return ids;
}

/** Deletes only ids {@link personaUserId} derives. Cascades to their rows. */
export async function teardownPersonas(
  admin: SupabaseClient<Database>,
  personas: readonly EvalPersona[] = EVAL_PERSONAS,
): Promise<void> {
  assertLiveEval();
  for (const persona of personas) {
    await admin.auth.admin.deleteUser(personaUserId(persona));
  }
}

/**
 * Places chat can actually retrieve right now.
 *
 * Recorded with every run because inventory work is landing in parallel and
 * moves the same numbers. Without this column you cannot tell whether the
 * persona block improved divergence or the catalog simply grew - and
 * `match_places` requires a non-null embedding, so this is deliberately the
 * retrievable count, not the published one.
 */
export async function catalogSize(
  admin: SupabaseClient<Database>,
): Promise<number> {
  const { count } = await admin
    .from("places")
    .select("id", { count: "exact", head: true })
    .eq("is_published", true)
    .eq("is_chain", false)
    .not("embedding", "is", null);
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Running the matrix
// ---------------------------------------------------------------------------

export interface MatrixCell {
  personaId: string;
  scenarioId: number;
  slugs: string[];
  picks: ChatPickCard[];
  /** The assistant's lead-in text. */
  text: string;
  /** True when the agent loop failed and the turn fell back to keyword search. */
  degraded: boolean;
  /** Set when the cell threw or timed out; every metric skips it. */
  error?: string;
}

export interface MatrixResult {
  cells: MatrixCell[];
  catalogSize: number;
  startedAt: string;
  personaIds: string[];
  scenarioIds: number[];
}

/** Bounded-concurrency map. Preserves input order in the output. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= items.length) return;
        results[index] = await fn(items[index], index);
      }
    })(),
  );
  await Promise.all(workers);
  return results;
}

export async function runMatrix(opts?: {
  personas?: readonly EvalPersona[];
  scenarios?: readonly EvalScenario[];
  concurrency?: number;
  /** Injectable for tests; defaults to a service-role client. */
  admin?: SupabaseClient<Database>;
}): Promise<MatrixResult> {
  assertLiveEval();

  const personas = opts?.personas ?? EVAL_PERSONAS;
  const scenarios = opts?.scenarios ?? EVAL_SCENARIOS;
  const admin = opts?.admin ?? createAdminClient();
  const startedAt = new Date().toISOString();

  const userIds = await seedPersonas(admin, personas);
  const size = await catalogSize(admin);

  const jobs = personas.flatMap((persona) =>
    scenarios.map((scenario) => ({ persona, scenario })),
  );

  const cells = await mapWithConcurrency(
    jobs,
    opts?.concurrency ?? DEFAULT_CONCURRENCY,
    async ({ persona, scenario }): Promise<MatrixCell> => {
      const base = { personaId: persona.id, scenarioId: scenario.id };
      try {
        // No threadId: every cell is a fresh conversation. Reusing a thread
        // would let the no-repeat rule manufacture divergence that has nothing
        // to do with taste.
        const turn = await withTimeout(
          runChatTurn(admin, userIds.get(persona.id)!, {
            message: scenario.text,
          }),
          CELL_TIMEOUT_MS,
          `eval cell ${persona.id}/${scenario.id}`,
        );
        const picks = turn.type === "picks" ? turn.picks : [];
        return {
          ...base,
          slugs: picks.map((p) => p.slug),
          picks,
          text: turn.text,
          degraded: turn.degraded === true,
        };
      } catch (error) {
        return {
          ...base,
          slugs: [],
          picks: [],
          text: "",
          degraded: true,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  return {
    cells,
    catalogSize: size,
    startedAt,
    personaIds: personas.map((p) => p.id),
    scenarioIds: scenarios.map((s) => s.id),
  };
}

// ---------------------------------------------------------------------------
// Summarizing
// ---------------------------------------------------------------------------

export interface ScenarioSummary {
  scenarioId: number;
  text: string;
  /** Mean pairwise pick overlap across personas. Lower is better. */
  overlap: number | null;
  comparedPersonas: number;
  skippedEmpty: number;
}

export interface MatrixSummary {
  startedAt: string;
  catalogSize: number;
  cells: number;
  erroredCells: number;
  degradedCells: number;
  /** Mean of the per-scenario overlaps. The headline number. */
  meanOverlap: number | null;
  perScenario: ScenarioSummary[];
  /** Share of picks whose reason the model wrote for this member. */
  modelReasonShare: number | null;
  /** Share of reasons naming at least one of that persona's own tokens. */
  reasonSpecificity: number | null;
  /** Share of replies narrating the profile back at the member. */
  recitationRate: number | null;
  /** Every banned house-voice phrase that appeared, with a count. */
  bannedPhrases: Record<string, number>;
}

export function summarize(result: MatrixResult): MatrixSummary {
  const personaById = new Map(EVAL_PERSONAS.map((p) => [p.id, p]));
  const usable = result.cells.filter((c) => !c.error);

  const perScenario: ScenarioSummary[] = result.scenarioIds.map((id) => {
    const runs = usable
      .filter((c) => c.scenarioId === id)
      .map((c) => ({ personaId: c.personaId, slugs: c.slugs }));
    const { overlap, comparedPersonas, skippedEmpty } = pickOverlap(runs);
    return {
      scenarioId: id,
      text: EVAL_SCENARIOS.find((s) => s.id === id)?.text ?? "",
      overlap,
      comparedPersonas,
      skippedEmpty,
    };
  });

  const overlaps = perScenario
    .map((s) => s.overlap)
    .filter((o): o is number => o !== null);

  const allPicks = usable.flatMap((c) => c.picks);

  // Reason specificity is per (pick, persona): does the reason name anything
  // from that member's own vocabulary?
  let specific = 0;
  let reasoned = 0;
  for (const cell of usable) {
    const persona = personaById.get(cell.personaId);
    if (!persona) continue;
    const tokens = personaTokens(persona);
    for (const pick of cell.picks) {
      if (!pick.reason) continue;
      reasoned += 1;
      if (reasonSpecificity(pick.reason, tokens)) specific += 1;
    }
  }

  const banned: Record<string, number> = {};
  for (const cell of usable) {
    const texts = [cell.text, ...cell.picks.map((p) => p.reason)];
    for (const text of texts) {
      for (const phrase of bannedPhrasesIn(text)) {
        banned[phrase] = (banned[phrase] ?? 0) + 1;
      }
    }
  }

  return {
    startedAt: result.startedAt,
    catalogSize: result.catalogSize,
    cells: result.cells.length,
    erroredCells: result.cells.length - usable.length,
    degradedCells: usable.filter((c) => c.degraded).length,
    meanOverlap:
      overlaps.length > 0
        ? overlaps.reduce((a, b) => a + b, 0) / overlaps.length
        : null,
    perScenario,
    modelReasonShare: modelReasonShare(allPicks),
    reasonSpecificity: reasoned > 0 ? specific / reasoned : null,
    recitationRate: recitationRate(
      usable.flatMap((c) => [c.text, ...c.picks.map((p) => p.reason)]),
    ),
    bannedPhrases: banned,
  };
}

const pct = (n: number | null) => (n === null ? "n/a" : `${(n * 100).toFixed(1)}%`);

/** Human-readable report - what the nightly job posts and what step 5 gates on. */
export function formatReport(summary: MatrixSummary): string {
  const lines = [
    `chat personalization eval - ${summary.startedAt}`,
    `catalog (published, non-chain, embedded): ${summary.catalogSize} places`,
    `cells: ${summary.cells} (${summary.erroredCells} errored, ${summary.degradedCells} degraded)`,
    ``,
    `pick overlap (LOWER is better; 1.0 = every persona got the same places): ${pct(summary.meanOverlap)}`,
    `model-written reasons (higher is better):                              ${pct(summary.modelReasonShare)}`,
    `reasons naming the member's own vocabulary:                            ${pct(summary.reasonSpecificity)}`,
    `replies reciting the profile (LOWER is better):                        ${pct(summary.recitationRate)}`,
    ``,
    `per scenario:`,
  ];

  for (const s of summary.perScenario) {
    const note =
      s.skippedEmpty > 0 ? `  (${s.skippedEmpty} persona(s) got no picks)` : "";
    lines.push(
      `  #${String(s.scenarioId).padStart(2)} overlap ${pct(s.overlap).padStart(6)}  ${s.text.slice(0, 56)}${note}`,
    );
  }

  const bannedEntries = Object.entries(summary.bannedPhrases);
  lines.push(``);
  lines.push(
    bannedEntries.length === 0
      ? `banned phrases: none`
      : `banned phrases: ${bannedEntries.map(([p, n]) => `"${p}" x${n}`).join(", ")}`,
  );

  return lines.join("\n");
}

export { EVAL_PERSONAS, EVAL_SCENARIOS };
