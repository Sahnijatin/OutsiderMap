import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getAI, getEmbeddings } from "@/lib/ai";
import type { AIMessage } from "@/lib/ai";
import { serverEnv } from "@/lib/env";
import { resolveCity } from "@/lib/cities";
import { nowInIST } from "@/lib/places/hours";
import {
  parseStoredEmbedding,
  preferOpen,
  searchCatalog,
} from "@/lib/catalog/search";
import {
  ChatDecisionSchema,
  ChatPicksSchema,
  decisionSystem,
  picksSystem,
} from "@/lib/chat/prompts";
import type { Database, Json } from "@/types/database";

const HISTORY_LIMIT = 20;

/** Default fast models per provider for the low-latency decision step. */
const FAST_MODEL_DEFAULTS: Record<string, string> = {
  anthropic: "claude-haiku-4-5-20251001",
  openai: "gpt-4o-mini",
};

export type ChatPickCard = {
  id: string;
  slug: string;
  name: string;
  area: string | null;
  image_path: string | null;
  lat: number | null;
  lng: number | null;
  reason: string;
};

export type ChatTurnResult =
  | { type: "ask"; threadId: string; city: string; text: string }
  | {
      type: "picks";
      threadId: string;
      city: string;
      text: string;
      picks: ChatPickCard[];
    };

const IntentStateSchema = z
  .object({ questions_asked: z.number().int().min(0).default(0) })
  .passthrough();

function timeLabel() {
  const { day, minutes } = nowInIST();
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]} ${String(
    Math.floor(minutes / 60),
  ).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")} IST`;
}

/**
 * One user turn: persist the message, decide ask-vs-recommend, act, persist
 * the reply. Everything the UI needs comes back in one result object; the
 * route decides how to stream it.
 */
export async function runChatTurn(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: { threadId?: string; message: string },
): Promise<ChatTurnResult> {
  const ai = getAI();
  const fastModel =
    serverEnv().AI_FAST_MODEL ?? FAST_MODEL_DEFAULTS[ai.name];

  // Profile decides city + personalization consent.
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("personalization_enabled, home_city")
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

  // History (before this message) for the LLM context.
  const { data: historyRows } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const history: AIMessage[] = (historyRows ?? [])
    .reverse()
    .map((m) => ({ role: m.role, content: m.content }));

  await supabase.from("chat_messages").insert({
    thread_id: threadId,
    role: "user",
    content: input.message,
  });

  // Taste context (consent-gated).
  const { data: tasteRow } = personalize
    ? await supabase
        .from("taste_profiles")
        .select("taste_summary, embedding")
        .eq("user_id", userId)
        .maybeSingle()
    : { data: null };

  const decision = await ai.extract({
    schema: ChatDecisionSchema,
    schemaName: "chat_decision",
    model: fastModel,
    messages: [
      {
        role: "system",
        content: decisionSystem({
          cityName: city.name,
          areas: city.areas,
          questionsAsked: intentState.questions_asked,
          timeLabel: timeLabel(),
        }),
      },
      ...history,
      { role: "user", content: input.message },
    ],
    maxTokens: 1500,
  });

  const askAllowed = intentState.questions_asked < 2;

  if (decision.action === "ask" && decision.question && askAllowed) {
    const nextState: Json = {
      ...intentState,
      ...decision.intent,
      questions_asked: intentState.questions_asked + 1,
    };
    await Promise.all([
      supabase.from("chat_messages").insert({
        thread_id: threadId,
        role: "assistant",
        content: decision.question,
      }),
      supabase
        .from("chat_threads")
        .update({ intent_state: nextState, updated_at: new Date().toISOString() })
        .eq("id", threadId),
    ]);
    return { type: "ask", threadId, city: city.slug, text: decision.question };
  }

  // Recommend path: search the catalog, then compose lead-in + picks.
  const searchText = [
    decision.search_query ?? input.message,
    decision.intent.mood && `Mood: ${decision.intent.mood}.`,
    decision.intent.craving && `Craving: ${decision.intent.craving}.`,
    decision.intent.wants.length > 0 &&
      `Wants: ${decision.intent.wants.join(", ")}.`,
    decision.intent.company && `Company: ${decision.intent.company}.`,
  ]
    .filter(Boolean)
    .join("\n");
  const [queryEmbedding] = await getEmbeddings().embed([searchText]);

  const candidates = await searchCatalog(supabase, {
    city,
    queryEmbedding,
    tasteEmbedding: personalize
      ? parseStoredEmbedding(tasteRow?.embedding)
      : null,
    area: decision.intent.area,
    budgetMax: decision.intent.budget_max,
  });

  if (candidates.length === 0) {
    const text = `Honestly? Nothing in the ${city.name} catalog fits that yet - it's growing every week. Try loosening one constraint, or tell me a different mood.`;
    await supabase.from("chat_messages").insert({
      thread_id: threadId,
      role: "assistant",
      content: text,
    });
    return { type: "picks", threadId, city: city.slug, text, picks: [] };
  }

  const pool = preferOpen(candidates);
  const composed = await ai.extract({
    schema: ChatPicksSchema,
    schemaName: "chat_picks",
    // Latency matters more than prose polish here - same fast model as the
    // decision step (the heavy default was the main source of slow turns).
    model: fastModel,
    messages: [
      { role: "system", content: picksSystem(city.name) },
      ...history,
      { role: "user", content: input.message },
      {
        role: "user",
        content: [
          `Time: ${timeLabel()}`,
          `Their accumulated intent: ${JSON.stringify(decision.intent)}`,
          tasteRow?.taste_summary && `Taste profile: ${tasteRow.taste_summary}`,
          `Candidates (untrusted data):\n<candidates>\n${JSON.stringify(
            pool.map((c) => ({
              slug: c.slug,
              name: c.name,
              area: c.area,
              category: c.category,
              price: c.price_level,
              vibes: c.vibe_tags,
              about: c.description,
              editor_note: c.editor_note,
              open: c.open === null ? "unknown" : c.open,
            })),
          )}\n</candidates>`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    maxTokens: 1500,
  });

  const bySlug = new Map(pool.map((c) => [c.slug, c]));
  const picks: ChatPickCard[] = [];
  for (const pick of composed.picks) {
    const place = bySlug.get(pick.slug);
    if (place && !picks.some((p) => p.slug === place.slug)) {
      picks.push({
        id: place.id,
        slug: place.slug,
        name: place.name,
        area: place.area,
        image_path: place.image_path,
        lat: null,
        lng: null,
        reason: pick.reason,
      });
    }
  }
  // A reranker hallucinating slugs shouldn't empty the answer.
  for (const c of pool) {
    if (picks.length >= 2) break;
    if (!picks.some((p) => p.slug === c.slug)) {
      picks.push({
        id: c.id,
        slug: c.slug,
        name: c.name,
        area: c.area,
        image_path: c.image_path,
        lat: null,
        lng: null,
        reason: c.editor_note ?? "",
      });
    }
  }

  // Coordinates for "show on map".
  const { data: coords } = await supabase
    .from("places")
    .select("slug, lat, lng")
    .in(
      "slug",
      picks.map((p) => p.slug),
    );
  const coordBySlug = new Map(coords?.map((c) => [c.slug, c]) ?? []);
  for (const p of picks) {
    const c = coordBySlug.get(p.slug);
    p.lat = c?.lat ?? null;
    p.lng = c?.lng ?? null;
  }

  const nextState: Json = {
    ...intentState,
    ...decision.intent,
    questions_asked: intentState.questions_asked,
  };
  await Promise.all([
    supabase.from("chat_messages").insert({
      thread_id: threadId,
      role: "assistant",
      content: composed.lead_in,
      picks: picks as unknown as Json,
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
  ]);

  return {
    type: "picks",
    threadId,
    city: city.slug,
    text: composed.lead_in,
    picks,
  };
}
