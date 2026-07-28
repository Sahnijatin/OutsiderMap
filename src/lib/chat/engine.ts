import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getAI } from "@/lib/ai";
import type { AIMessage } from "@/lib/ai";
import { describeError } from "@/lib/ai/retry";
import { resolveCity } from "@/lib/cities";
import { nowInIST } from "@/lib/places/hours";
import { keywordSearch } from "@/lib/catalog/search";
import { agentSystem } from "@/lib/chat/prompts";
import { loadPersona, renderPersona } from "@/lib/chat/persona";
import { extractRupees } from "@/lib/chat/budget";
import { detectRegister } from "@/lib/chat/language";
import { sanitizeReply } from "@/lib/chat/sanitize";
import {
  buildChatTools,
  ChatToolCollector,
  type ChatToolContext,
} from "@/lib/chat/tools";
import type { Database, Json } from "@/types/database";
import { ANSWER_SERVED, newAnswerId, servedPayload } from "@/lib/events/answers";
import { ONE_ANSWER_VS_LIST, resolveVariant } from "@/lib/experiments/server";

const HISTORY_LIMIT = 20;
/** Cap the agent loop: model -> tools -> model, a few rounds is plenty here. */
const MAX_STEPS = 6;

export type ChatPickCard = {
  id: string;
  slug: string;
  name: string;
  area: string | null;
  image_path: string | null;
  lat: number | null;
  lng: number | null;
  reason: string;
  /**
   * Where `reason` came from: "model" means the agent wrote it for this user
   * and this ask; "editor_note" marks the static-note fallback (the model
   * omitted a reason, or the turn degraded). Optional because picks persisted
   * before this field existed carry editor notes - treat missing as
   * "editor_note".
   */
  reasonSource?: "model" | "editor_note";
  /** Ties a click on this pick back to the exact answer it was served in (#120). */
  answerId: string;
};

export type ChatTurnResult =
  | {
      type: "ask";
      threadId: string;
      city: string;
      text: string;
      /** Set when the agent built a trackable market shopping run this turn. */
      marketRunId?: string;
      /** True when the agent loop failed and this turn is not personalized. */
      degraded?: boolean;
    }
  | {
      type: "picks";
      threadId: string;
      city: string;
      text: string;
      picks: ChatPickCard[];
      /** Set when the agent built a trackable plan this turn. */
      planId?: string;
      /** Set when the agent built a trackable market shopping run this turn. */
      marketRunId?: string;
      /**
       * True when the agent loop failed and the picks are a keyword fallback -
       * real places, but not personalized. The UI must say so.
       */
      degraded?: boolean;
    };

const IntentStateSchema = z
  .object({ questions_asked: z.number().int().min(0).default(0) })
  .passthrough();

/**
 * A degraded step logs one structured line and keeps the turn alive. These are
 * expected, recoverable events (a provider blip) - not the unhandled crashes
 * the route's catch is for - so they warn, not error.
 */
function logStepDegraded(
  step: string,
  err: unknown,
  meta: { userId: string; threadId: string | null },
) {
  console.warn(
    `[chat] ${step} step degraded`,
    JSON.stringify({ step, ...meta, ...describeError(err) }),
  );
}

/**
 * Persistence failures must be loud. A turn that answers live but silently
 * fails to save its messages reads later as "my conversation disappeared" -
 * the thread title survives (chat_threads wrote fine) while the transcript
 * never landed. That exact failure shipped once: a schema-drift insert error
 * was swallowed here and only surfaced as users reopening empty threads.
 */
function logPersistFailure(
  step: string,
  error: { message: string },
  meta: { userId: string; threadId: string | null },
) {
  console.error(
    `[chat] ${step} persist failed`,
    JSON.stringify({ step, ...meta, message: error.message }),
  );
}

function timeLabel() {
  const { day, minutes } = nowInIST();
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]} ${String(
    Math.floor(minutes / 60),
  ).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")} IST`;
}

/**
 * One user turn as a tool-calling agent loop. Persist the message, let the
 * agent reason + call tools (search / plan / behaviour / show / save), then
 * render whatever it chose to surface. Everything the UI needs comes back in
 * one result object; the route decides how to send it.
 */
/**
 * Streaming hooks for the SSE path. `onDelta` receives the model's text as it
 * generates; `onToolStep` fires at each turn boundary so the caller can drop
 * interim narration (a turn that called tools) and surface progress.
 */
export interface ChatStreamHooks {
  onDelta?: (delta: string) => void;
  onToolStep?: (info: { toolNames: string[] }) => void;
}

export async function runChatTurn(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: { threadId?: string; message: string },
  hooks?: ChatStreamHooks,
): Promise<ChatTurnResult> {
  const ai = getAI();

  // Profile decides city + personalization consent, and names the member.
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("personalization_enabled, home_city, display_name")
    .eq("id", userId)
    .maybeSingle();
  const personalize = profileRow?.personalization_enabled !== false;
  const city = await resolveCity(supabase, profileRow?.home_city);

  // Load or create the thread.
  let threadId = input.threadId ?? null;
  let intentState: z.infer<typeof IntentStateSchema> = { questions_asked: 0 };
  if (threadId) {
    const { data: thread } = await supabase
      .from("chat_threads")
      .select("id, intent_state")
      .eq("id", threadId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!thread) threadId = null;
    else {
      const parsed = IntentStateSchema.safeParse(thread.intent_state);
      if (parsed.success) intentState = parsed.data;
    }
  }
  if (!threadId) {
    const { data: created, error } = await supabase
      .from("chat_threads")
      .insert({
        user_id: userId,
        city: city.slug,
        title: input.message.slice(0, 80),
      })
      .select("id")
      .single();
    if (error) throw new Error(`thread create failed: ${error.message}`);
    threadId = created.id;
  }

  // History (before this message) for the agent's context. Picks ride along:
  // without them the model has no memory of what it already recommended and
  // keeps re-serving the same places (the "same answers again" complaint) -
  // stored assistant content is only the short lead-in line.
  const { data: historyRows } = await supabase
    .from("chat_messages")
    .select("role, content, picks, plan_id")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const shownEarlier = new Map<string, string>(); // slug -> name
  const priorPlanIds: string[] = [];
  const history: AIMessage[] = (historyRows ?? [])
    .reverse()
    .map((m) => {
      const picks = parseHistoryPicks(m.picks);
      for (const p of picks) shownEarlier.set(p.slug, p.name);
      if (m.plan_id) priorPlanIds.push(m.plan_id);
      // Inline what the user actually saw with that message - pick cards and
      // any built plan - so the transcript the model reads matches the
      // conversation the user had. The plan_id note is what lets a later
      // "explain the plan" turn call get_plan instead of describing a plan
      // it can no longer see.
      const notes: string[] = [];
      if (picks.length > 0) {
        notes.push(
          `[recommended: ${picks.map((p) => `${p.name} (${p.slug})`).join(", ")}]`,
        );
      }
      if (m.plan_id) notes.push(`[built plan, plan_id: ${m.plan_id}]`);
      const content =
        notes.length > 0 ? `${m.content}\n${notes.join("\n")}` : m.content;
      return { role: m.role, content };
    });

  // Stops from plans built earlier in this thread count as "already
  // recommended" too: without this, a second plan freely reuses the first
  // plan's stops (the two-near-identical-plans complaint). Plan stops aren't
  // in `picks`, so they're resolved from the persisted plan ids.
  if (priorPlanIds.length > 0) {
    const { data: planStops } = await supabase
      .from("quest_stops")
      .select("places(slug, name)")
      .in("quest_id", priorPlanIds);
    for (const s of planStops ?? []) {
      if (s.places?.slug && !shownEarlier.has(s.places.slug)) {
        shownEarlier.set(s.places.slug, s.places.name);
      }
    }
  }

  const { error: userMsgError } = await supabase.from("chat_messages").insert({
    thread_id: threadId,
    role: "user",
    content: input.message,
  });
  if (userMsgError) {
    logPersistFailure("user_message", userMsgError, { userId, threadId });
  }

  // Taste + learned behaviour (consent-gated) for the behaviour tool and the
  // persona block. `quiz_answers` carries the anchors the block leans on.
  const { data: tasteRow } = personalize
    ? await supabase
        .from("taste_profiles")
        .select("taste_summary, learned_signals, quiz_answers")
        .eq("user_id", userId)
        .maybeSingle()
    : { data: null };

  // Who the model is talking to, in the prompt itself rather than behind a tool
  // call it may never make. Costs one round trip (two queries in parallel) on a
  // turn budgeted at 55s, and saves a loop step whenever the model would have
  // reached for get_user_behavior just to find out who this is.
  const persona = await loadPersona(supabase, userId, personalize, {
    displayName: profileRow?.display_name ?? null,
    quizAnswers: tasteRow?.quiz_answers ?? null,
    learnedSignals: tasteRow?.learned_signals ?? null,
  });

  const collector = new ChatToolCollector();
  const toolCtx: ChatToolContext = {
    supabase,
    userId,
    city,
    personalize,
    tasteSummary: tasteRow?.taste_summary ?? null,
    learnedSignals: tasteRow?.learned_signals ?? null,
    // Same prior the persona block used, so the tool and the block cannot
    // report two different dials for the same member on the same turn.
    quizPrior: persona ? { adventurousness: persona.quizAdventurousness } : null,
    persona,
    shownEarlier: new Set(shownEarlier.keys()),
  };
  const tools = buildChatTools(toolCtx, collector);

  const messages: AIMessage[] = [
    {
      role: "system",
      content: agentSystem({
        cityName: city.name,
        areas: city.areas,
        timeLabel: timeLabel(),
        questionsAsked: intentState.questions_asked,
        personalize,
        persona: renderPersona(persona),
        replyHint: detectRegister(input.message).replyHint,
        budgetRupees: extractRupees(input.message),
        shownEarlier: [...shownEarlier.values()],
      }),
    },
    ...history,
    { role: "user", content: input.message },
  ];

  // Run the agent loop. If it fails outright (provider down), degrade to a
  // keyword search so the turn still answers with real places - but flag the
  // result so the UI never passes those picks off as personalized.
  let text = "";
  let degraded = false;
  try {
    const result = await ai.runTools({
      messages,
      tools,
      maxSteps: MAX_STEPS,
      onText: hooks?.onDelta,
      onStep: hooks?.onToolStep
        ? (info) => {
            // A turn that called tools produced only interim narration - signal
            // a boundary so the client discards it before the next turn streams.
            if (info.hadToolCalls) hooks.onToolStep!({ toolNames: info.toolNames });
          }
        : undefined,
    });
    // Deterministic cleanup: the UI renders plain text, so markdown or em
    // dashes that slip past the voice rules would show as literal noise.
    text = sanitizeReply(result.text);
  } catch (err) {
    logStepDegraded("agent", err, { userId, threadId });
    degraded = true;
    await fallbackSearch(supabase, collector, {
      city,
      message: input.message,
    });
  }

  // The debug trace (tools called + why) - greppable, not yet persisted.
  console.info(
    "[chat] trace",
    JSON.stringify({ userId, threadId, trace: collector.trace }),
  );

  const shown = collector.shownPlaces();

  // No places shown and no plan built: the agent answered or asked a question.
  if (shown.length === 0 && !collector.planId) {
    const reply =
      text ||
      "Tell me a bit more - what are you in the mood for, and roughly where?";
    const isQuestion = reply.trimEnd().endsWith("?");
    // A question spends clarify budget; a plain answer closes the ask cycle
    // and resets it (mirrors the picks path below), so the cap governs one
    // ask's back-and-forth rather than the whole thread forever.
    const nextState: Json = {
      ...intentState,
      questions_asked: isQuestion ? intentState.questions_asked + 1 : 0,
    };
    const [{ error: replyError }] = await Promise.all([
      supabase.from("chat_messages").insert({
        thread_id: threadId,
        role: "assistant",
        content: reply,
        degraded,
        market_run_id: collector.marketRunId,
      }),
      supabase
        .from("chat_threads")
        .update({ intent_state: nextState, updated_at: new Date().toISOString() })
        .eq("id", threadId),
    ]);
    if (replyError) {
      logPersistFailure("assistant_message", replyError, { userId, threadId });
    }
    const askResult: ChatTurnResult = {
      type: "ask",
      threadId,
      city: city.slug,
      text: reply,
    };
    if (collector.marketRunId) askResult.marketRunId = collector.marketRunId;
    if (degraded) askResult.degraded = true;
    return askResult;
  }

  // A/B: when the one-answer-vs-list experiment is on, "one" shows a single
  // pick, "list" shows the three. Off (or unassigned) → the default three.
  const assignment = await resolveVariant(supabase, ONE_ANSWER_VS_LIST, userId);
  const shownForVariant =
    assignment?.variant === "one" ? shown.slice(0, 1) : shown;

  // Picks path: resolve coordinates + a short reason for each shown place.
  const { data: placeRows } = await supabase
    .from("places")
    .select("slug, lat, lng, editor_note")
    .in(
      "slug",
      shownForVariant.map((p) => p.slug),
    );
  const detailBySlug = new Map(placeRows?.map((r) => [r.slug, r]) ?? []);
  const answerId = newAnswerId();
  const picks: ChatPickCard[] = shownForVariant.map((p) => {
    const detail = detailBySlug.get(p.slug);
    // The model's own reason for this user wins; the static editor note is
    // only the fallback, and the card is marked so the UI can say so.
    const modelReason = collector.reasons.get(p.slug)?.trim();
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      area: p.area,
      image_path: p.image_path,
      lat: detail?.lat ?? null,
      lng: detail?.lng ?? null,
      reason: modelReason || (detail?.editor_note ?? ""),
      reasonSource: modelReason ? "model" : "editor_note",
      answerId,
    };
  });

  const leadIn =
    text ||
    (collector.planId
      ? `I put together "${collector.planTitle ?? "a plan"}" for you - it's saved and trackable.`
      : degraded
        ? "Here's what a quick search turns up:"
        : "Here's what fits best right now:");

  // An answer was served, so this ask cycle is over - reset the clarify
  // budget. Left uncapped-and-unreset, two early questions would jam the
  // guard for the life of the thread and the agent could never clarify a
  // later plan-shaped ask.
  const nextState: Json = {
    ...intentState,
    questions_asked: 0,
  };
  const [{ error: picksMsgError }] = await Promise.all([
    supabase.from("chat_messages").insert({
      thread_id: threadId,
      role: "assistant",
      content: leadIn,
      picks: picks as unknown as Json,
      degraded,
      // Durable pointers: without them the "View plan" / shopping-run buttons
      // exist only in the live stream and vanish on thread reload.
      plan_id: collector.planId,
      market_run_id: collector.marketRunId,
    }),
    supabase
      .from("chat_threads")
      .update({ intent_state: nextState, updated_at: new Date().toISOString() })
      .eq("id", threadId),
    // The ask feeds the learning loop like a Right Now query does.
    supabase.from("interaction_events").insert({
      user_id: userId,
      event_type: "query",
      payload: { query: input.message, source: "chat" },
    }),
    // Precise serve signal (#120): links a later pick-click back to this answer,
    // and carries the A/B variant so accept-rate reads per variant.
    supabase.from("interaction_events").insert({
      user_id: userId,
      event_type: ANSWER_SERVED,
      payload: servedPayload({
        answerId,
        source: "chat",
        query: input.message,
        picks: shownForVariant.map((p) => p.slug),
        experiment: assignment?.experiment,
        variant: assignment?.variant,
      }),
    }),
  ]);
  if (picksMsgError) {
    logPersistFailure("assistant_message", picksMsgError, { userId, threadId });
  }

  const result: ChatTurnResult = {
    type: "picks",
    threadId,
    city: city.slug,
    text: leadIn,
    picks,
  };
  if (collector.planId) result.planId = collector.planId;
  if (collector.marketRunId) result.marketRunId = collector.marketRunId;
  if (degraded) result.degraded = true;
  return result;
}

const HistoryPickSchema = z.object({ slug: z.string(), name: z.string() });

/**
 * Picks persisted on a past assistant message, parsed defensively: the column
 * is plain Json and rows predate several shape changes, so anything malformed
 * degrades to "no picks" rather than sinking the turn.
 */
function parseHistoryPicks(raw: Json | null): Array<{ slug: string; name: string }> {
  if (!Array.isArray(raw)) return [];
  const picks: Array<{ slug: string; name: string }> = [];
  for (const entry of raw) {
    const parsed = HistoryPickSchema.safeParse(entry);
    if (parsed.success) picks.push(parsed.data);
  }
  return picks;
}

/**
 * Last-ditch retrieval when the agent loop itself fails: keyword-search the raw
 * message and surface the top few, so a provider outage still returns real
 * places instead of an error bubble.
 */
async function fallbackSearch(
  supabase: SupabaseClient<Database>,
  collector: ChatToolCollector,
  opts: { city: Parameters<typeof keywordSearch>[1]["city"]; message: string },
) {
  try {
    const candidates = await keywordSearch(supabase, {
      city: opts.city,
      terms: [opts.message],
    });
    for (const c of candidates.slice(0, 3)) {
      collector.surfaced.set(c.slug, {
        id: c.id,
        slug: c.slug,
        name: c.name,
        area: c.area,
        image_path: c.image_path,
      });
      if (!collector.shown.includes(c.slug)) collector.shown.push(c.slug);
    }
  } catch {
    // Nothing more to fall back to - the turn returns an empty ask.
  }
}
