/**
 * Supabase database types, handwritten to mirror
 * supabase/migrations/. Once a live project exists, regenerate with:
 *
 *   npx supabase gen types typescript --linked > src/types/database.ts
 *
 * pgvector columns surface as strings over PostgREST - serialize embeddings
 * with JSON.stringify(numbers) when writing.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Experience kinds in the catalog (see places.kind). */
export type PlaceKind =
  | "spot"
  | "cafe"
  | "nightlife"
  | "workshop"
  | "historical"
  | "cultural"
  | "event";

/** Interaction taxonomy feeding the learning loop (see interaction_events). */
export type InteractionEventType =
  | "query"
  | "view"
  | "save"
  | "unsave"
  | "rate"
  | "visit"
  | "dismiss"
  | "plan_add"
  | "rec_click"
  | "start"
  | "complete"
  | "bucket_add"
  | "story_view"
  | "dwell"
  | "quest_start"
  | "stop_complete"
  | "quest_complete"
  | "chat_pick_click"
  | "reel_share";

/** Quest lifecycle (see quests.status). */
export type QuestStatus = "draft" | "active" | "completed" | "abandoned";

/** Stop lifecycle (see quest_stops.status). */
export type QuestStopStatus = "locked" | "unlocked" | "completed";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          home_area: string | null;
          is_admin: boolean;
          personalization_enabled: boolean;
          onboarding_completed_at: string | null;
          outsider_number: number | null;
          username: string | null;
          home_city: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          home_area?: string | null;
          is_admin?: boolean;
          personalization_enabled?: boolean;
          onboarding_completed_at?: string | null;
          outsider_number?: number | null;
          username?: string | null;
          home_city?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          home_area?: string | null;
          is_admin?: boolean;
          personalization_enabled?: boolean;
          onboarding_completed_at?: string | null;
          outsider_number?: number | null;
          username?: string | null;
          home_city?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      cities: {
        Row: {
          slug: string;
          name: string;
          lat: number;
          lng: number;
          zoom: number;
          is_live: boolean;
          areas: string[];
          created_at: string;
        };
        Insert: {
          slug: string;
          name: string;
          lat: number;
          lng: number;
          zoom?: number;
          is_live?: boolean;
          areas?: string[];
          created_at?: string;
        };
        Update: {
          slug?: string;
          name?: string;
          lat?: number;
          lng?: number;
          zoom?: number;
          is_live?: boolean;
          areas?: string[];
          created_at?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          user_id: string;
          tier: "free" | "premium";
          status: "active" | "past_due" | "canceled";
          provider: string;
          provider_subscription_id: string | null;
          current_period_end: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          tier?: "free" | "premium";
          status?: "active" | "past_due" | "canceled";
          provider?: string;
          provider_subscription_id?: string | null;
          current_period_end?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          tier?: "free" | "premium";
          status?: "active" | "past_due" | "canceled";
          provider?: string;
          provider_subscription_id?: string | null;
          current_period_end?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      taste_profiles: {
        Row: {
          user_id: string;
          quiz_answers: Json;
          learned_signals: Json;
          taste_summary: string | null;
          embedding: string | null;
          version: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          quiz_answers?: Json;
          learned_signals?: Json;
          taste_summary?: string | null;
          embedding?: string | null;
          version?: number;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          quiz_answers?: Json;
          learned_signals?: Json;
          taste_summary?: string | null;
          embedding?: string | null;
          version?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      places: {
        Row: {
          id: string;
          slug: string;
          name: string;
          city: string;
          area: string | null;
          lat: number | null;
          lng: number | null;
          category: string | null;
          price_level: number | null;
          vibe_tags: string[];
          description: string | null;
          editor_note: string | null;
          hours: Json | null;
          best_for: Json | null;
          image_path: string | null;
          embedding: string | null;
          is_published: boolean;
          source: "curated" | "submitted" | "ingested";
          kind: PlaceKind;
          is_chain: boolean;
          story: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          city?: string;
          area?: string | null;
          lat?: number | null;
          lng?: number | null;
          category?: string | null;
          price_level?: number | null;
          vibe_tags?: string[];
          description?: string | null;
          editor_note?: string | null;
          hours?: Json | null;
          best_for?: Json | null;
          image_path?: string | null;
          embedding?: string | null;
          is_published?: boolean;
          source?: "curated" | "submitted" | "ingested";
          kind?: PlaceKind;
          is_chain?: boolean;
          story?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          city?: string;
          area?: string | null;
          lat?: number | null;
          lng?: number | null;
          category?: string | null;
          price_level?: number | null;
          vibe_tags?: string[];
          description?: string | null;
          editor_note?: string | null;
          hours?: Json | null;
          best_for?: Json | null;
          image_path?: string | null;
          embedding?: string | null;
          is_published?: boolean;
          source?: "curated" | "submitted" | "ingested";
          kind?: PlaceKind;
          is_chain?: boolean;
          story?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          place_id: string | null;
          title: string;
          description: string | null;
          venue_name: string | null;
          area: string | null;
          lat: number | null;
          lng: number | null;
          starts_at: string;
          ends_at: string | null;
          vibe_tags: string[];
          is_underground: boolean;
          required_tier: "free" | "premium";
          ticket_url: string | null;
          image_path: string | null;
          is_published: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          place_id?: string | null;
          title: string;
          description?: string | null;
          venue_name?: string | null;
          area?: string | null;
          lat?: number | null;
          lng?: number | null;
          starts_at: string;
          ends_at?: string | null;
          vibe_tags?: string[];
          is_underground?: boolean;
          required_tier?: "free" | "premium";
          ticket_url?: string | null;
          image_path?: string | null;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          place_id?: string | null;
          title?: string;
          description?: string | null;
          venue_name?: string | null;
          area?: string | null;
          lat?: number | null;
          lng?: number | null;
          starts_at?: string;
          ends_at?: string | null;
          vibe_tags?: string[];
          is_underground?: boolean;
          required_tier?: "free" | "premium";
          ticket_url?: string | null;
          image_path?: string | null;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_place_id_fkey";
            columns: ["place_id"];
            isOneToOne: false;
            referencedRelation: "places";
            referencedColumns: ["id"];
          },
        ];
      };
      saved_places: {
        Row: {
          user_id: string;
          place_id: string;
          note: string | null;
          status: "saved" | "started" | "completed";
          created_at: string;
        };
        Insert: {
          user_id: string;
          place_id: string;
          note?: string | null;
          status?: "saved" | "started" | "completed";
          created_at?: string;
        };
        Update: {
          user_id?: string;
          place_id?: string;
          note?: string | null;
          status?: "saved" | "started" | "completed";
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "saved_places_place_id_fkey";
            columns: ["place_id"];
            isOneToOne: false;
            referencedRelation: "places";
            referencedColumns: ["id"];
          },
        ];
      };
      interaction_events: {
        Row: {
          id: number;
          user_id: string;
          event_type: InteractionEventType;
          place_id: string | null;
          event_id: string | null;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: never;
          user_id: string;
          event_type: InteractionEventType;
          place_id?: string | null;
          event_id?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: never;
          user_id?: string;
          event_type?: InteractionEventType;
          place_id?: string | null;
          event_id?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      weekend_plans: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          weekend_start: string;
          status: "draft" | "final";
          items: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          weekend_start: string;
          status?: "draft" | "final";
          items?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          weekend_start?: string;
          status?: "draft" | "final";
          items?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      waitlist: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          email: string;
          phone: string;
          gender: string | null;
          city: string;
          instagram: string | null;
          referral_code: string;
          referred_by: string | null;
          spot_place_id: string | null;
          status: "pending" | "accepted" | "rejected" | "waitlisted";
          utm_source: string | null;
          utm_medium: string | null;
          utm_campaign: string | null;
          utm_term: string | null;
          utm_content: string | null;
          referrer: string | null;
          selfie_path: string | null;
          photo_paths: string[];
          reviewed_at: string | null;
          reviewer_note: string | null;
          consent_personal_data: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          first_name: string;
          last_name: string;
          email: string;
          phone: string;
          gender?: string | null;
          city: string;
          instagram?: string | null;
          referral_code: string;
          referred_by?: string | null;
          spot_place_id?: string | null;
          status?: "pending" | "accepted" | "rejected" | "waitlisted";
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          utm_term?: string | null;
          utm_content?: string | null;
          referrer?: string | null;
          selfie_path?: string | null;
          photo_paths?: string[];
          reviewed_at?: string | null;
          reviewer_note?: string | null;
          consent_personal_data?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          first_name?: string;
          last_name?: string;
          email?: string;
          phone?: string;
          gender?: string | null;
          city?: string;
          instagram?: string | null;
          referral_code?: string;
          referred_by?: string | null;
          spot_place_id?: string | null;
          status?: "pending" | "accepted" | "rejected" | "waitlisted";
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          utm_term?: string | null;
          utm_content?: string | null;
          referrer?: string | null;
          selfie_path?: string | null;
          photo_paths?: string[];
          reviewed_at?: string | null;
          reviewer_note?: string | null;
          consent_personal_data?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "waitlist_spot_place_id_fkey";
            columns: ["spot_place_id"];
            isOneToOne: false;
            referencedRelation: "places";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_threads: {
        Row: {
          id: string;
          user_id: string;
          city: string;
          title: string | null;
          intent_state: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          city?: string;
          title?: string | null;
          intent_state?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          city?: string;
          title?: string | null;
          intent_state?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          thread_id: string;
          role: "user" | "assistant";
          content: string;
          picks: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          thread_id: string;
          role: "user" | "assistant";
          content: string;
          picks?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          thread_id?: string;
          role?: "user" | "assistant";
          content?: string;
          picks?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey";
            columns: ["thread_id"];
            isOneToOne: false;
            referencedRelation: "chat_threads";
            referencedColumns: ["id"];
          },
        ];
      };
      quests: {
        Row: {
          id: string;
          user_id: string;
          city: string;
          title: string;
          brief: Json;
          status: QuestStatus;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          city?: string;
          title: string;
          brief?: Json;
          status?: QuestStatus;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          city?: string;
          title?: string;
          brief?: Json;
          status?: QuestStatus;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      quest_stops: {
        Row: {
          id: string;
          quest_id: string;
          position: number;
          place_id: string;
          note: string | null;
          capture_guide: Json;
          status: QuestStopStatus;
          user_note: string | null;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          quest_id: string;
          position: number;
          place_id: string;
          note?: string | null;
          capture_guide?: Json;
          status?: QuestStopStatus;
          user_note?: string | null;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          quest_id?: string;
          position?: number;
          place_id?: string;
          note?: string | null;
          capture_guide?: Json;
          status?: QuestStopStatus;
          user_note?: string | null;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "quest_stops_quest_id_fkey";
            columns: ["quest_id"];
            isOneToOne: false;
            referencedRelation: "quests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quest_stops_place_id_fkey";
            columns: ["place_id"];
            isOneToOne: false;
            referencedRelation: "places";
            referencedColumns: ["id"];
          },
        ];
      };
      quest_stop_media: {
        Row: {
          id: string;
          stop_id: string;
          user_id: string;
          storage_path: string;
          media_type: "image" | "video";
          duration_seconds: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          stop_id: string;
          user_id: string;
          storage_path: string;
          media_type: "image" | "video";
          duration_seconds?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          stop_id?: string;
          user_id?: string;
          storage_path?: string;
          media_type?: "image" | "video";
          duration_seconds?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quest_stop_media_stop_id_fkey";
            columns: ["stop_id"];
            isOneToOne: false;
            referencedRelation: "quest_stops";
            referencedColumns: ["id"];
          },
        ];
      };
      reel_jobs: {
        Row: {
          id: string;
          quest_id: string;
          user_id: string;
          status: "queued" | "processing" | "done" | "failed";
          template: string;
          attempts: number;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          quest_id: string;
          user_id: string;
          status?: "queued" | "processing" | "done" | "failed";
          template?: string;
          attempts?: number;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          quest_id?: string;
          user_id?: string;
          status?: "queued" | "processing" | "done" | "failed";
          template?: string;
          attempts?: number;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reel_jobs_quest_id_fkey";
            columns: ["quest_id"];
            isOneToOne: true;
            referencedRelation: "quests";
            referencedColumns: ["id"];
          },
        ];
      };
      reels: {
        Row: {
          id: string;
          source: "curated" | "user_quest";
          user_id: string | null;
          quest_id: string | null;
          place_id: string | null;
          city: string;
          video_path: string;
          poster_path: string | null;
          caption: string | null;
          duration_seconds: number | null;
          status: "pending" | "approved" | "rejected";
          created_at: string;
        };
        Insert: {
          id?: string;
          source?: "curated" | "user_quest";
          user_id?: string | null;
          quest_id?: string | null;
          place_id?: string | null;
          city?: string;
          video_path: string;
          poster_path?: string | null;
          caption?: string | null;
          duration_seconds?: number | null;
          status?: "pending" | "approved" | "rejected";
          created_at?: string;
        };
        Update: {
          id?: string;
          source?: "curated" | "user_quest";
          user_id?: string | null;
          quest_id?: string | null;
          place_id?: string | null;
          city?: string;
          video_path?: string;
          poster_path?: string | null;
          caption?: string | null;
          duration_seconds?: number | null;
          status?: "pending" | "approved" | "rejected";
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reels_place_id_fkey";
            columns: ["place_id"];
            isOneToOne: false;
            referencedRelation: "places";
            referencedColumns: ["id"];
          },
        ];
      };
      ingest_items: {
        Row: {
          id: string;
          url: string;
          source_type: "instagram" | "youtube" | "blog" | "other";
          status:
            | "queued"
            | "fetching"
            | "extracted"
            | "needs_review"
            | "approved"
            | "rejected"
            | "failed";
          raw_metadata: Json | null;
          candidate: Json | null;
          dedupe_matches: Json | null;
          error: string | null;
          created_by: string | null;
          reviewed_by: string | null;
          place_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          url: string;
          source_type?: "instagram" | "youtube" | "blog" | "other";
          status?:
            | "queued"
            | "fetching"
            | "extracted"
            | "needs_review"
            | "approved"
            | "rejected"
            | "failed";
          raw_metadata?: Json | null;
          candidate?: Json | null;
          dedupe_matches?: Json | null;
          error?: string | null;
          created_by?: string | null;
          reviewed_by?: string | null;
          place_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          url?: string;
          source_type?: "instagram" | "youtube" | "blog" | "other";
          status?:
            | "queued"
            | "fetching"
            | "extracted"
            | "needs_review"
            | "approved"
            | "rejected"
            | "failed";
          raw_metadata?: Json | null;
          candidate?: Json | null;
          dedupe_matches?: Json | null;
          error?: string | null;
          created_by?: string | null;
          reviewed_by?: string | null;
          place_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      device_tokens: {
        Row: {
          token: string;
          user_id: string;
          platform: "ios" | "android";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          token: string;
          user_id: string;
          platform: "ios" | "android";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          token?: string;
          user_id?: string;
          platform?: "ios" | "android";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      notification_sends: {
        Row: {
          id: number;
          user_id: string;
          kind: string;
          sent_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          kind: string;
          sent_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          kind?: string;
          sent_at?: string;
        };
        Relationships: [];
      };
      friendships: {
        Row: {
          id: string;
          requester: string;
          addressee: string;
          status: "pending" | "accepted";
          created_at: string;
          responded_at: string | null;
        };
        Insert: {
          id?: string;
          requester: string;
          addressee: string;
          status?: "pending" | "accepted";
          created_at?: string;
          responded_at?: string | null;
        };
        Update: {
          id?: string;
          requester?: string;
          addressee?: string;
          status?: "pending" | "accepted";
          created_at?: string;
          responded_at?: string | null;
        };
        Relationships: [];
      };
      follows: {
        Row: {
          follower: string;
          followee: string;
          created_at: string;
        };
        Insert: {
          follower: string;
          followee: string;
          created_at?: string;
        };
        Update: {
          follower?: string;
          followee?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      posts: {
        Row: {
          id: string;
          author_id: string;
          type: "status" | "photo" | "video" | "review" | "list";
          place_id: string | null;
          area: string | null;
          city: string;
          action: string | null;
          mood: string | null;
          body: string | null;
          visibility: "public" | "followers" | "friends" | "private";
          location_precision: "exact" | "area" | "hidden";
          status: "pending" | "approved" | "rejected" | "removed";
          like_count: number;
          comment_count: number;
          want_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          type: "status" | "photo" | "video" | "review" | "list";
          place_id?: string | null;
          area?: string | null;
          city?: string;
          action?: string | null;
          mood?: string | null;
          body?: string | null;
          visibility?: "public" | "followers" | "friends" | "private";
          location_precision?: "exact" | "area" | "hidden";
          status?: "pending" | "approved" | "rejected" | "removed";
          like_count?: number;
          comment_count?: number;
          want_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          author_id?: string;
          type?: "status" | "photo" | "video" | "review" | "list";
          place_id?: string | null;
          area?: string | null;
          city?: string;
          action?: string | null;
          mood?: string | null;
          body?: string | null;
          visibility?: "public" | "followers" | "friends" | "private";
          location_precision?: "exact" | "area" | "hidden";
          status?: "pending" | "approved" | "rejected" | "removed";
          like_count?: number;
          comment_count?: number;
          want_count?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "posts_place_id_fkey";
            columns: ["place_id"];
            isOneToOne: false;
            referencedRelation: "places";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "posts_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      post_media: {
        Row: {
          id: string;
          post_id: string;
          kind: "image" | "video";
          path: string;
          poster_path: string | null;
          ordinal: number;
        };
        Insert: {
          id?: string;
          post_id: string;
          kind: "image" | "video";
          path: string;
          poster_path?: string | null;
          ordinal?: number;
        };
        Update: {
          id?: string;
          post_id?: string;
          kind?: "image" | "video";
          path?: string;
          poster_path?: string | null;
          ordinal?: number;
        };
        Relationships: [];
      };
      post_reactions: {
        Row: {
          post_id: string;
          user_id: string;
          kind: "like" | "want_to_go";
          created_at: string;
        };
        Insert: {
          post_id: string;
          user_id: string;
          kind?: "like" | "want_to_go";
          created_at?: string;
        };
        Update: {
          post_id?: string;
          user_id?: string;
          kind?: "like" | "want_to_go";
          created_at?: string;
        };
        Relationships: [];
      };
      post_comments: {
        Row: {
          id: string;
          post_id: string;
          author_id: string;
          body: string;
          status: "approved" | "removed";
          created_at: string;
        };
        Insert: {
          id?: string;
          post_id: string;
          author_id: string;
          body: string;
          status?: "approved" | "removed";
          created_at?: string;
        };
        Update: {
          id?: string;
          post_id?: string;
          author_id?: string;
          body?: string;
          status?: "approved" | "removed";
          created_at?: string;
        };
        Relationships: [];
      };
      activity_events: {
        Row: {
          id: number;
          recipient_id: string;
          actor_id: string;
          type: "follow" | "like" | "want_to_go" | "comment" | "quest_complete";
          post_id: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          recipient_id: string;
          actor_id: string;
          type: "follow" | "like" | "want_to_go" | "comment" | "quest_complete";
          post_id?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          recipient_id?: string;
          actor_id?: string;
          type?: "follow" | "like" | "want_to_go" | "comment" | "quest_complete";
          post_id?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      content_reports: {
        Row: {
          id: string;
          reporter_id: string;
          target_type: "post" | "comment" | "profile";
          target_id: string;
          reason: string | null;
          created_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          reporter_id: string;
          target_type: "post" | "comment" | "profile";
          target_id: string;
          reason?: string | null;
          created_at?: string;
          resolved_at?: string | null;
        };
        Update: {
          id?: string;
          reporter_id?: string;
          target_type?: "post" | "comment" | "profile";
          target_id?: string;
          reason?: string | null;
          created_at?: string;
          resolved_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      event_teasers: {
        Args: { max_count?: number };
        Returns: {
          id: string;
          area: string | null;
          starts_at: string;
          vibe_tags: string[];
          is_underground: boolean;
        }[];
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      can_view_post: {
        Args: { p_author: string; p_visibility: string; p_status: string };
        Returns: boolean;
      };
      can_view_post_by_id: {
        Args: { p_post_id: string };
        Returns: boolean;
      };
      post_author: {
        Args: { p_post_id: string };
        Returns: string;
      };
      follow_state: {
        Args: { target: string };
        Returns: {
          follower_count: number;
          following_count: number;
          is_following: boolean;
          follows_you: boolean;
        }[];
      };
      public_authors: {
        Args: { ids: string[] };
        Returns: {
          id: string;
          username: string | null;
          display_name: string | null;
          avatar_url: string | null;
          outsider_number: number | null;
        }[];
      };
      is_premium: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      username_available: {
        Args: { candidate: string };
        Returns: boolean;
      };
      search_members: {
        Args: { q: string };
        Returns: {
          id: string;
          username: string;
          display_name: string | null;
          outsider_number: number | null;
        }[];
      };
      get_public_profiles: {
        Args: { ids: string[] };
        Returns: {
          id: string;
          username: string;
          display_name: string | null;
          outsider_number: number | null;
        }[];
      };
      find_member_by_username: {
        Args: { candidate: string };
        Returns: {
          id: string;
          username: string;
          display_name: string | null;
          outsider_number: number | null;
        }[];
      };
      start_quest: {
        Args: { p_quest_id: string };
        Returns: undefined;
      };
      complete_quest_stop: {
        Args: { p_stop_id: string; p_require_media?: boolean };
        Returns: {
          quest_completed: boolean;
          next_stop_id: string | null;
        }[];
      };
      match_places: {
        Args: {
          query_embedding: string;
          match_count?: number;
          filter_city?: string;
          filter_area?: string | null;
          max_price_level?: number | null;
        };
        Returns: {
          id: string;
          slug: string;
          name: string;
          area: string | null;
          category: string | null;
          price_level: number | null;
          vibe_tags: string[];
          description: string | null;
          editor_note: string | null;
          similarity: number;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];

export type MatchedPlace =
  PublicSchema["Functions"]["match_places"]["Returns"][number];
