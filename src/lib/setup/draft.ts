import { QUIZ, type QuizAnswers } from "@/lib/taste/quiz";

/**
 * A local draft of the taste quiz.
 *
 * The quiz holds its answers in component state and writes nothing until the
 * last question submits, so a refresh - or an iOS WebView deciding to reclaim
 * the tab - loses the lot. That was survivable when the quiz was screen two of
 * two. With four screens in front of it, someone who reloads on question seven
 * has thrown away real work.
 *
 * localStorage rather than a server draft: the quiz is one sitting on one
 * device, a column would cost a write per tap and an interaction with
 * taste_profiles.version, and the only weakness here - per-device state -
 * doesn't apply to a two-minute flow. `normalizeQuizDraft` is the pure core so
 * the parsing rules can be tested in the node harness; if cross-device resume
 * is ever wanted, that function moves to a jsonb column untouched.
 *
 * Every path is guarded: private mode, a quota error, a corrupt value and a
 * server render all fall back to an empty draft rather than throwing.
 */

const STORAGE_KEY = "om.setup.quiz.v1";

/** Refuse to parse something absurd rather than spending the main thread on it. */
const MAX_RAW_BYTES = 64 * 1024;

export type QuizDraft = {
  answers: QuizAnswers;
  /** 0-based question index within the quiz. */
  index: number;
};

export const EMPTY_QUIZ_DRAFT: QuizDraft = { answers: {}, index: 0 };

function emptyDraft(): QuizDraft {
  return { answers: {}, index: 0 };
}

/**
 * Coerce an unknown parsed blob into a usable draft.
 *
 * Values that `AnswersSchema` would later reject (numbers, booleans, nested
 * objects, arrays of non-strings) are dropped here rather than carried to the
 * server and failing the whole submit - a stale draft must never be able to
 * break a fresh quiz.
 */
export function normalizeQuizDraft(raw: unknown): QuizDraft {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyDraft();

  const source = raw as { answers?: unknown; index?: unknown };
  const answers: QuizAnswers = {};

  if (
    source.answers &&
    typeof source.answers === "object" &&
    !Array.isArray(source.answers)
  ) {
    for (const [key, value] of Object.entries(
      source.answers as Record<string, unknown>,
    )) {
      if (typeof value === "string") {
        answers[key] = value;
      } else if (
        Array.isArray(value) &&
        value.every((v) => typeof v === "string")
      ) {
        answers[key] = value as string[];
      }
      // Anything else is dropped on purpose.
    }
  }

  const rawIndex =
    typeof source.index === "number" && Number.isFinite(source.index)
      ? Math.floor(source.index)
      : 0;
  // Clamp, so a draft written against a longer quiz can't index off the end.
  const index = Math.min(Math.max(rawIndex, 0), Math.max(QUIZ.length - 1, 0));

  return { answers, index };
}

/**
 * Scoped to the member.
 *
 * A shared laptop is the whole reason: without this, whoever signs in next is
 * seeded with the previous member's answers - and then submits them as their
 * own taste profile.
 */
export function quizDraftKey(userId: string): string {
  return `${STORAGE_KEY}.${userId}`;
}

/** The stored draft, or an empty one. Never throws. */
export function readQuizDraft(userId: string): QuizDraft {
  try {
    if (typeof localStorage === "undefined") return emptyDraft();
    const raw = localStorage.getItem(quizDraftKey(userId));
    if (!raw || raw.length > MAX_RAW_BYTES) return emptyDraft();
    return normalizeQuizDraft(JSON.parse(raw));
  } catch {
    return emptyDraft();
  }
}

/** Persist the draft. Never throws - a failed write just means no resume. */
export function writeQuizDraft(userId: string, draft: QuizDraft): void {
  cached = draft;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(quizDraftKey(userId), JSON.stringify(draft));
    }
  } catch {
    // Private mode or quota. The in-memory answers still work this session.
  }
  notify();
}

/** Drop the draft once the answers are safely on the server. */
export function clearQuizDraft(userId: string): void {
  cached = emptyDraft();
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(quizDraftKey(userId));
    }
  } catch {
    // Nothing to do - a stale draft is overwritten by the next quiz anyway.
  }
  notify();
}

/**
 * Exposed as an external store rather than seeded into state.
 *
 * /setup is server-rendered, so reading localStorage in a `useState`
 * initialiser makes the server emit question 1 while the client emits question
 * N - a hydration mismatch that fires precisely in the case this feature
 * exists for. useSyncExternalStore renders the server snapshot during
 * hydration and swaps to the real one after, which is exactly what it is for.
 * Same shape as lib/sound/prefs.ts and lib/capacitor/platform.ts.
 */
const listeners = new Set<() => void>();
let cached: QuizDraft | null = null;

function notify() {
  for (const listener of [...listeners]) listener();
}

export function subscribeQuizDraft(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** Client snapshot. Cached, so repeat renders don't re-parse localStorage. */
export function quizDraftSnapshot(userId: string): QuizDraft {
  if (!cached) cached = readQuizDraft(userId);
  return cached;
}

/** Hydration baseline: the server always renders an untouched quiz. */
export function quizDraftServerSnapshot(): QuizDraft {
  return EMPTY_QUIZ_DRAFT;
}
