/**
 * Response shapes mirroring the backend /api/* route handlers. Kept in sync by
 * hand (the web owns the source types in src/types/database.ts and
 * src/lib/now/recommend.ts).
 */

export type PlaceKind =
  | "spot"
  | "cafe"
  | "nightlife"
  | "workshop"
  | "historical"
  | "cultural"
  | "event";

export type Experience = {
  id: string;
  slug: string;
  name: string;
  area: string | null;
  kind: PlaceKind;
  category: string | null;
  price_level: number | null;
  vibe_tags: string[];
  description: string | null;
  image_path: string | null;
  open?: boolean | null;
  openLabel?: string | null;
};

export type StoryCard = {
  media_path?: string | null;
  media_type?: "image" | "video";
  caption?: string | null;
};

export type ExperienceDetail = Experience & {
  editor_note: string | null;
  best_for: unknown;
  story: StoryCard[];
  lat: number | null;
  lng: number | null;
};

export type Pick = {
  place: Experience & { openLabel: string | null };
  reason: string;
};

export type TonightEvent = {
  id: string;
  title: string;
  venue_name: string | null;
  area: string | null;
  starts_at: string;
  is_underground: boolean;
};

export type RecommendResult = {
  picks: Pick[];
  intent: unknown;
  tonight: TonightEvent[];
  lockedTonightCount: number;
};

export type FeedResult = {
  forYou: Experience[];
  fresh: Experience[];
  tonight: TonightEvent[];
};

export type ProfileResult = {
  profile: {
    display_name: string | null;
    avatar_url: string | null;
    home_area: string | null;
    personalization_enabled: boolean;
    onboarding_completed_at: string | null;
  } | null;
  taste: {
    taste_summary: string | null;
    learned_signals: unknown;
    version: number;
    updated_at: string;
  } | null;
};

export type InteractionAction =
  | "save"
  | "unsave"
  | "dismiss"
  | "visit"
  | "rate"
  | "start"
  | "complete";
