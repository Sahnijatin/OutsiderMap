import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAI } from "@/lib/ai";
import type { AIMessage } from "@/lib/ai";
import { describeError } from "@/lib/ai/retry";
import { resolveCity } from "@/lib/cities";
import { keywordSearch, parseStoredEmbedding } from "@/lib/catalog/search";
import {
  buildChatTools,
  ChatToolCollector,
  type ChatToolContext,
} from "@/lib/chat/tools";
import { detectRegister } from "@/lib/chat/language";
import {
  loadPersona,
  renderPersonaCompact,
  type Persona,
} from "@/lib/chat/persona";
import type { Database, Json } from "@/types/database";

/**
 * The lighter, shared-brain agent behind the map search bar (#99). Same toolbox
 * as full chat, but scoped to a reduced two-tool set (search_places +
 * show_on_map) and a find/filter prompt - no conversation, no planning, no
 * questions. Returns grounded catalog slugs; the client resolves them against
 * the places it already has loaded and flies to them.
 */

const MAX_STEPS = 3;

/**
 * Scoped system prompt: understand, search, show - nothing more.
 *
 * The taste line is one line by design. This surface ranks pins and writes at
 * most a one-line summary, so it needs vocabulary to sort by and nothing else -
 * no anchors, no history, and none of the don't-recite coaching chat needs,
 * because there are no per-pick reasons here to get wrong.
 */
function mapSearchSystem(cityName: string, personaLine: string): string {
  return [
    `You are the map search for ${cityName} on OutsiderMap.`,
    `Understand the user's query - including Hinglish, typos, and vibes - call search_places, then show_on_map the matches.`,
    `You find and filter real catalog places on the map. You do not chat, plan, ask questions, or save anything.`,
    `Only ever surface real catalog places returned by search_places; never invent one. If nothing fits, say so briefly.`,
    ...(personaLine ? [personaLine] : []),
    `Keep any text to a short one-line summary. Write with plain hyphens only, never em or en dashes.`,
  ].join("\n");
}

export interface MapSearchResult {
  text: string;
  /** Grounded catalog slugs the agent chose to show, in order. */
  slugs: string[];
}

export async function runMapSearch(
  supabase: SupabaseClient<Database>,
  opts: { message: string; userId: string | null; citySlug?: string | null },
): Promise<MapSearchResult> {
  const ai = getAI();

  let personalize = false;
  let tasteEmbedding: number[] | null = null;
  let tasteSummary: string | null = null;
  let learnedSignals: Json | null = null;
  let persona: Persona | null = null;
  let homeCity: string | null = opts.citySlug ?? null;

  if (opts.userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("personalization_enabled, home_city, display_name")
      .eq("id", opts.userId)
      .maybeSingle();
    personalize = profile?.personalization_enabled !== false;
    if (!homeCity) homeCity = profile?.home_city ?? null;
    if (personalize) {
      const { data: taste } = await supabase
        .from("taste_profiles")
        .select("taste_summary, embedding, learned_signals, quiz_answers")
        .eq("user_id", opts.userId)
        .maybeSingle();
      tasteEmbedding = parseStoredEmbedding(taste?.embedding);
      tasteSummary = taste?.taste_summary ?? null;
      learnedSignals = taste?.learned_signals ?? null;
      persona = await loadPersona(
        supabase,
        opts.userId,
        personalize,
        {
          displayName: profile?.display_name ?? null,
          quizAnswers: taste?.quiz_answers ?? null,
          learnedSignals,
        },
        { includeHistory: false },
      );
    }
  }

  const city = await resolveCity(supabase, homeCity);
  const collector = new ChatToolCollector();
  const ctx: ChatToolContext = {
    supabase,
    userId: opts.userId ?? "",
    city,
    personalize,
    tasteEmbedding,
    tasteSummary,
    learnedSignals,
  };
  // Reduced toolbox: find + show only.
  const tools = buildChatTools(ctx, collector).filter(
    (t) => t.name === "search_places" || t.name === "show_on_map",
  );

  const replyHint = detectRegister(opts.message).replyHint;
  const system = mapSearchSystem(city.name, renderPersonaCompact(persona));
  const messages: AIMessage[] = [
    {
      role: "system",
      content: replyHint ? `${system}\n\n${replyHint}` : system,
    },
    { role: "user", content: opts.message },
  ];

  let text = "";
  try {
    const result = await ai.runTools({ messages, tools, maxSteps: MAX_STEPS });
    text = result.text.trim();
  } catch (err) {
    console.warn(
      "[map-search] agent degraded",
      JSON.stringify({ userId: opts.userId, ...describeError(err) }),
    );
    // Degrade to a keyword search so the bar still returns real places.
    try {
      const candidates = await keywordSearch(supabase, {
        city,
        terms: [opts.message],
      });
      for (const c of candidates.slice(0, 8)) {
        if (!collector.shown.includes(c.slug)) collector.shown.push(c.slug);
      }
    } catch {
      // Nothing to fall back to.
    }
  }

  return { text, slugs: collector.shown };
}
