import { fetch as expoFetch } from "expo/fetch";
import { supabase } from "@/lib/supabase";
import type {
  Experience,
  ExperienceDetail,
  FeedResult,
  InteractionAction,
  ProfileResult,
  RecommendResult,
} from "@/lib/types";

const BASE = process.env.EXPO_PUBLIC_API_URL ?? "";
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";

async function authHeader(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await authHeader()),
  };
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // non-JSON error body
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

/** Public storage URL for an image/media path (defaults to the places bucket). */
export function mediaUrl(
  path: string | null | undefined,
  bucket: "place-images" | "experience-media" = "place-images",
): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

export const api = {
  askNow: (query: string) =>
    request<RecommendResult>("/api/now", { method: "POST", body: { query } }),

  feed: () => request<FeedResult>("/api/feed"),

  experiences: (params: {
    kind?: string;
    area?: string;
    maxPrice?: number;
    openNow?: boolean;
    limit?: number;
  } = {}) => {
    const q = new URLSearchParams();
    if (params.kind) q.set("kind", params.kind);
    if (params.area) q.set("area", params.area);
    if (params.maxPrice) q.set("maxPrice", String(params.maxPrice));
    if (params.openNow) q.set("openNow", "true");
    if (params.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return request<{ items: Experience[] }>(
      `/api/experiences${qs ? `?${qs}` : ""}`,
    );
  },

  experience: (slug: string) =>
    request<ExperienceDetail>(`/api/experiences/${encodeURIComponent(slug)}`),

  interact: (
    action: InteractionAction,
    placeId: string,
    extra?: { rating?: 1 | -1; query?: string },
  ) =>
    request<{ ok: true }>("/api/interactions", {
      method: "POST",
      body: { action, placeId, ...extra },
    }),

  getProfile: () => request<ProfileResult>("/api/profile"),

  setConsent: (personalization_enabled: boolean) =>
    request<{ ok: true }>("/api/profile", {
      method: "PATCH",
      body: { personalization_enabled },
    }),

  submitOnboarding: (answers: Record<string, string | string[]>) =>
    request<{ ok: true }>("/api/onboarding", {
      method: "POST",
      body: answers,
    }),
};

/**
 * Streams the personalized "why this place, right now". Uses expo/fetch (which
 * supports a readable body stream) and yields text chunks as they arrive.
 */
export async function* streamWhy(
  slug: string,
  query: string,
): AsyncGenerator<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await authHeader()),
  };
  const res = await expoFetch(`${BASE}/api/now/why`, {
    method: "POST",
    headers,
    body: JSON.stringify({ slug, query }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`why stream failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield decoder.decode(value, { stream: true });
  }
}
