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

/**
 * Kinds of durable fact the concierge may remember (see member_memory).
 *
 * Closed on purpose: `constraint` is the only one the prompt renders as
 * unbreakable, so the set has to stay small enough to reason about.
 */
export type MemoryKind =
  | "constraint"
  | "dislike"
  | "company"
  | "occasion"
  | "budget"
  | "access";

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
  | "reel_share"
  | "market_report"
  | "bounty_created"
  | "confirmation_submitted"
  | "spot_published"
  | "spot_rejected"
  | "scout_warning"
  | "points_clawback"
  | "answer_served"
  | "answer_accepted";

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
          activated_at: string | null;
          outsider_number: number | null;
          username: string | null;
          home_city: string | null;
          curator_score: number;
          taste_card_public: boolean;
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
          activated_at?: string | null;
          outsider_number?: number | null;
          username?: string | null;
          home_city?: string | null;
          curator_score?: number;
          taste_card_public?: boolean;
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
          activated_at?: string | null;
          outsider_number?: number | null;
          username?: string | null;
          home_city?: string | null;
          curator_score?: number;
          taste_card_public?: boolean;
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
      map_categories: {
        Row: {
          id: string;
          slug: string;
          label: string;
          color: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          label: string;
          color: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          label?: string;
          color?: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      experiments: {
        Row: {
          key: string;
          description: string | null;
          variants: string[];
          enabled: boolean;
          created_at: string;
        };
        Insert: {
          key: string;
          description?: string | null;
          variants: string[];
          enabled?: boolean;
          created_at?: string;
        };
        Update: {
          key?: string;
          description?: string | null;
          variants?: string[];
          enabled?: boolean;
          created_at?: string;
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
          submitted_by: string | null;
          category_id: string | null;
          kind: PlaceKind;
          is_chain: boolean;
          story: Json;
          google_place_id: string | null;
          geo_source: "typed" | "osm" | "overture" | "scout_median" | "owner";
          geo_accuracy_m: number | null;
          geo_confirmed_count: number;
          geo_updated_at: string | null;
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
          submitted_by?: string | null;
          category_id?: string | null;
          kind?: PlaceKind;
          is_chain?: boolean;
          story?: Json;
          google_place_id?: string | null;
          geo_source?: "typed" | "osm" | "overture" | "scout_median" | "owner";
          geo_accuracy_m?: number | null;
          geo_confirmed_count?: number;
          geo_updated_at?: string | null;
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
          submitted_by?: string | null;
          category_id?: string | null;
          kind?: PlaceKind;
          is_chain?: boolean;
          story?: Json;
          google_place_id?: string | null;
          geo_source?: "typed" | "osm" | "overture" | "scout_median" | "owner";
          geo_accuracy_m?: number | null;
          geo_confirmed_count?: number;
          geo_updated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      place_media: {
        Row: {
          id: string;
          place_id: string;
          kind: "image" | "video" | "embed";
          licence_basis: "user_upload" | "owner_supplied" | "editorial" | "embed";
          storage_path: string | null;
          source_url: string | null;
          source_platform: "instagram" | "youtube" | "other" | null;
          author_name: string | null;
          author_url: string | null;
          embed_html: string | null;
          thumbnail_url: string | null;
          contributor_id: string | null;
          captured_lat: number | null;
          captured_lng: number | null;
          captured_at: string | null;
          caption: string | null;
          sort_order: number;
          status: "pending" | "published" | "removed";
          removed_reason: string | null;
          removed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          place_id: string;
          kind: "image" | "video" | "embed";
          licence_basis: "user_upload" | "owner_supplied" | "editorial" | "embed";
          storage_path?: string | null;
          source_url?: string | null;
          source_platform?: "instagram" | "youtube" | "other" | null;
          author_name?: string | null;
          author_url?: string | null;
          embed_html?: string | null;
          thumbnail_url?: string | null;
          contributor_id?: string | null;
          captured_lat?: number | null;
          captured_lng?: number | null;
          captured_at?: string | null;
          caption?: string | null;
          sort_order?: number;
          status?: "pending" | "published" | "removed";
          removed_reason?: string | null;
          removed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          kind?: "image" | "video" | "embed";
          licence_basis?: "user_upload" | "owner_supplied" | "editorial" | "embed";
          storage_path?: string | null;
          source_url?: string | null;
          source_platform?: "instagram" | "youtube" | "other" | null;
          author_name?: string | null;
          author_url?: string | null;
          embed_html?: string | null;
          thumbnail_url?: string | null;
          contributor_id?: string | null;
          captured_lat?: number | null;
          captured_lng?: number | null;
          captured_at?: string | null;
          caption?: string | null;
          sort_order?: number;
          status?: "pending" | "published" | "removed";
          removed_reason?: string | null;
          removed_at?: string | null;
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
          degraded: boolean;
          picks: Json | null;
          plan_id: string | null;
          market_run_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          thread_id: string;
          role: "user" | "assistant";
          content: string;
          degraded?: boolean;
          picks?: Json | null;
          plan_id?: string | null;
          market_run_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          thread_id?: string;
          role?: "user" | "assistant";
          content?: string;
          degraded?: boolean;
          picks?: Json | null;
          plan_id?: string | null;
          market_run_id?: string | null;
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
          {
            foreignKeyName: "chat_messages_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "quests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_messages_market_run_id_fkey";
            columns: ["market_run_id"];
            isOneToOne: false;
            referencedRelation: "market_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      member_memory: {
        Row: {
          id: string;
          user_id: string;
          kind: MemoryKind;
          text: string;
          confidence: number;
          source_message_id: string | null;
          created_at: string;
          updated_at: string;
          expires_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          kind: MemoryKind;
          text: string;
          confidence?: number;
          source_message_id?: string | null;
          created_at?: string;
          updated_at?: string;
          expires_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          kind?: MemoryKind;
          text?: string;
          confidence?: number;
          source_message_id?: string | null;
          created_at?: string;
          updated_at?: string;
          expires_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "member_memory_source_message_id_fkey";
            columns: ["source_message_id"];
            isOneToOne: false;
            referencedRelation: "chat_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      markets: {
        Row: {
          id: string;
          slug: string;
          name: string;
          city: string;
          area: string | null;
          categories: string[];
          character: string | null;
          timings: Json | null;
          tips: Json | null;
          is_published: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          city: string;
          area?: string | null;
          categories?: string[];
          character?: string | null;
          timings?: Json | null;
          tips?: Json | null;
          is_published?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          city?: string;
          area?: string | null;
          categories?: string[];
          character?: string | null;
          timings?: Json | null;
          tips?: Json | null;
          is_published?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      market_sections: {
        Row: {
          id: string;
          market_id: string;
          name: string;
          specialization: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          market_id: string;
          name: string;
          specialization?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          market_id?: string;
          name?: string;
          specialization?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      market_category_guides: {
        Row: {
          id: string;
          market_id: string;
          category: string;
          price_band_low: number | null;
          price_band_high: number | null;
          bargaining_note: string | null;
          quality_note: string | null;
          confidence: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          market_id: string;
          category: string;
          price_band_low?: number | null;
          price_band_high?: number | null;
          bargaining_note?: string | null;
          quality_note?: string | null;
          confidence?: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          market_id?: string;
          category?: string;
          price_band_low?: number | null;
          price_band_high?: number | null;
          bargaining_note?: string | null;
          quality_note?: string | null;
          confidence?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      shops: {
        Row: {
          id: string;
          market_id: string;
          section_id: string | null;
          name: string | null;
          shop_number: string | null;
          categories: string[];
          verified: boolean;
          confidence: number;
          last_seen: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          market_id: string;
          section_id?: string | null;
          name?: string | null;
          shop_number?: string | null;
          categories?: string[];
          verified?: boolean;
          confidence?: number;
          last_seen?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          market_id?: string;
          section_id?: string | null;
          name?: string | null;
          shop_number?: string | null;
          categories?: string[];
          verified?: boolean;
          confidence?: number;
          last_seen?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      price_points: {
        Row: {
          id: string;
          market_id: string;
          section_id: string | null;
          shop_id: string | null;
          category: string | null;
          item: string | null;
          price: number | null;
          currency: string;
          source: "authored" | "content_mined" | "user_report";
          source_ref: string | null;
          confidence: number;
          status: "pending" | "published" | "rejected";
          observed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          market_id: string;
          section_id?: string | null;
          shop_id?: string | null;
          category?: string | null;
          item?: string | null;
          price?: number | null;
          currency?: string;
          source: "authored" | "content_mined" | "user_report";
          source_ref?: string | null;
          confidence?: number;
          status?: "pending" | "published" | "rejected";
          observed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          market_id?: string;
          section_id?: string | null;
          shop_id?: string | null;
          category?: string | null;
          item?: string | null;
          price?: number | null;
          currency?: string;
          source?: "authored" | "content_mined" | "user_report";
          source_ref?: string | null;
          confidence?: number;
          status?: "pending" | "published" | "rejected";
          observed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      market_runs: {
        Row: {
          id: string;
          quest_id: string | null;
          user_id: string;
          market_id: string;
          city: string;
          budget_max: number | null;
          items: Json;
          plan: Json;
          status: QuestStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          quest_id?: string | null;
          user_id: string;
          market_id: string;
          city: string;
          budget_max?: number | null;
          items?: Json;
          plan?: Json;
          status?: QuestStatus;
          created_at?: string;
        };
        Update: {
          id?: string;
          quest_id?: string | null;
          user_id?: string;
          market_id?: string;
          city?: string;
          budget_max?: number | null;
          items?: Json;
          plan?: Json;
          status?: QuestStatus;
          created_at?: string;
        };
        Relationships: [];
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
      ingest_items: {
        Row: {
          id: string;
          url: string;
          source_type: "instagram" | "youtube" | "blog" | "other" | "maps" | "member";
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
          source_type?: "instagram" | "youtube" | "blog" | "other" | "maps" | "member";
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
          source_type?: "instagram" | "youtube" | "blog" | "other" | "maps" | "member";
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
          visibility: "public" | "followers" | "private";
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
          visibility?: "public" | "followers" | "private";
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
          visibility?: "public" | "followers" | "private";
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
          bucket: "post-media" | "reel-media";
        };
        Insert: {
          id?: string;
          post_id: string;
          kind: "image" | "video";
          path: string;
          poster_path?: string | null;
          ordinal?: number;
          bucket?: "post-media" | "reel-media";
        };
        Update: {
          id?: string;
          post_id?: string;
          kind?: "image" | "video";
          path?: string;
          poster_path?: string | null;
          ordinal?: number;
          bucket?: "post-media" | "reel-media";
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
      csam_staff: {
        Row: { user_id: string; added_at: string };
        Insert: { user_id: string; added_at?: string };
        Update: { user_id?: string; added_at?: string };
        Relationships: [];
      };
      moderation_cases: {
        Row: {
          id: string;
          target_type: "post" | "comment" | "reel" | "profile" | "submission" | "price_report";
          target_id: string;
          author_id: string | null;
          source: "pre_publish" | "report" | "rescan";
          assessment: Json | null;
          decision: "auto_approved" | "auto_rejected" | "needs_review" | "approved" | "removed" | "escalated";
          severity: number;
          reviewer_id: string | null;
          reason: string | null;
          created_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          target_type: "post" | "comment" | "reel" | "profile" | "submission" | "price_report";
          target_id: string;
          author_id?: string | null;
          source: "pre_publish" | "report" | "rescan";
          assessment?: Json | null;
          decision?: "auto_approved" | "auto_rejected" | "needs_review" | "approved" | "removed" | "escalated";
          severity?: number;
          reviewer_id?: string | null;
          reason?: string | null;
          created_at?: string;
          resolved_at?: string | null;
        };
        Update: {
          id?: string;
          target_type?: "post" | "comment" | "reel" | "profile" | "submission" | "price_report";
          target_id?: string;
          author_id?: string | null;
          source?: "pre_publish" | "report" | "rescan";
          assessment?: Json | null;
          decision?: "auto_approved" | "auto_rejected" | "needs_review" | "approved" | "removed" | "escalated";
          severity?: number;
          reviewer_id?: string | null;
          reason?: string | null;
          created_at?: string;
          resolved_at?: string | null;
        };
        Relationships: [];
      };
      user_trust: {
        Row: {
          user_id: string;
          tier: "new" | "member" | "trusted" | "restricted";
          strike_count: number;
          muted_until: string | null;
          banned_at: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          tier?: "new" | "member" | "trusted" | "restricted";
          strike_count?: number;
          muted_until?: string | null;
          banned_at?: string | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          tier?: "new" | "member" | "trusted" | "restricted";
          strike_count?: number;
          muted_until?: string | null;
          banned_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_blocks: {
        Row: { blocker: string; blocked: string; created_at: string };
        Insert: { blocker: string; blocked: string; created_at?: string };
        Update: { blocker?: string; blocked?: string; created_at?: string };
        Relationships: [];
      };
      grievances: {
        Row: {
          id: string;
          reporter_id: string | null;
          target_type: string | null;
          target_id: string | null;
          category: string;
          body: string | null;
          status: "received" | "acknowledged" | "resolved" | "appealed" | "rejected";
          received_at: string;
          acknowledged_at: string | null;
          resolved_at: string | null;
          officer_id: string | null;
          appealed_at: string | null;
          appeal_decision: "upheld" | "overturned" | null;
          appeal_decided_at: string | null;
        };
        Insert: {
          id?: string;
          reporter_id?: string | null;
          target_type?: string | null;
          target_id?: string | null;
          category: string;
          body?: string | null;
          status?: "received" | "acknowledged" | "resolved" | "appealed" | "rejected";
          received_at?: string;
          acknowledged_at?: string | null;
          resolved_at?: string | null;
          officer_id?: string | null;
          appealed_at?: string | null;
          appeal_decision?: "upheld" | "overturned" | null;
          appeal_decided_at?: string | null;
        };
        Update: {
          id?: string;
          reporter_id?: string | null;
          target_type?: string | null;
          target_id?: string | null;
          category?: string;
          body?: string | null;
          status?: "received" | "acknowledged" | "resolved" | "appealed" | "rejected";
          received_at?: string;
          acknowledged_at?: string | null;
          resolved_at?: string | null;
          officer_id?: string | null;
          appealed_at?: string | null;
          appeal_decision?: "upheld" | "overturned" | null;
          appeal_decided_at?: string | null;
        };
        Relationships: [];
      };
      moderation_actions: {
        Row: {
          id: string;
          case_id: string | null;
          actor: string;
          action: string;
          detail: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          case_id?: string | null;
          actor: string;
          action: string;
          detail?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          case_id?: string | null;
          actor?: string;
          action?: string;
          detail?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      csam_reports: {
        Row: {
          id: string;
          media_ref: string;
          match_source: string | null;
          reported_to_authority_at: string | null;
          status: "detected" | "preserved" | "reported" | "closed";
          created_at: string;
        };
        Insert: {
          id?: string;
          media_ref: string;
          match_source?: string | null;
          reported_to_authority_at?: string | null;
          status?: "detected" | "preserved" | "reported" | "closed";
          created_at?: string;
        };
        Update: {
          id?: string;
          media_ref?: string;
          match_source?: string | null;
          reported_to_authority_at?: string | null;
          status?: "detected" | "preserved" | "reported" | "closed";
          created_at?: string;
        };
        Relationships: [];
      };
      points_ledger: {
        Row: {
          id: string;
          user_id: string;
          delta: number;
          reason: "spot_verified" | "confirmation" | "discovery" | "clawback";
          ref_type: string | null;
          ref_id: string | null;
          status: "escrow" | "confirmed" | "clawed_back";
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          delta: number;
          reason: "spot_verified" | "confirmation" | "discovery" | "clawback";
          ref_type?: string | null;
          ref_id?: string | null;
          status?: "escrow" | "confirmed" | "clawed_back";
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          delta?: number;
          reason?: "spot_verified" | "confirmation" | "discovery" | "clawback";
          ref_type?: string | null;
          ref_id?: string | null;
          status?: "escrow" | "confirmed" | "clawed_back";
          created_at?: string;
        };
        Relationships: [];
      };
      reward_thresholds: {
        Row: {
          id: string;
          name: string;
          metric: "verified_spots" | "confirmations" | "points";
          threshold: number;
          grant: Json;
          is_active: boolean;
        };
        Insert: {
          id: string;
          name: string;
          metric: "verified_spots" | "confirmations" | "points";
          threshold: number;
          grant: Json;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          name?: string;
          metric?: "verified_spots" | "confirmations" | "points";
          threshold?: number;
          grant?: Json;
          is_active?: boolean;
        };
        Relationships: [];
      };
      reward_grants: {
        Row: {
          id: string;
          user_id: string;
          threshold_id: string;
          granted_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          threshold_id: string;
          granted_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          threshold_id?: string;
          granted_at?: string;
        };
        Relationships: [];
      };
      bounty_quests: {
        Row: {
          id: string;
          quest_id: string | null;
          type: "verify" | "discover";
          submission_id: string | null;
          area: string | null;
          city: string | null;
          lister_id: string | null;
          bounty_points: number;
          quorum_needed: number;
          quorum_needed_reject: number;
          status: "open" | "resolving" | "published" | "rejected" | "expired";
          created_at: string;
        };
        Insert: {
          id?: string;
          quest_id?: string | null;
          type: "verify" | "discover";
          submission_id?: string | null;
          area?: string | null;
          city?: string | null;
          lister_id?: string | null;
          bounty_points?: number;
          quorum_needed?: number;
          quorum_needed_reject?: number;
          status?: "open" | "resolving" | "published" | "rejected" | "expired";
          created_at?: string;
        };
        Update: {
          id?: string;
          quest_id?: string | null;
          type?: "verify" | "discover";
          submission_id?: string | null;
          area?: string | null;
          city?: string | null;
          lister_id?: string | null;
          bounty_points?: number;
          quorum_needed?: number;
          quorum_needed_reject?: number;
          status?: "open" | "resolving" | "published" | "rejected" | "expired";
          created_at?: string;
        };
        Relationships: [];
      };
      quest_confirmations: {
        Row: {
          id: string;
          bounty_id: string;
          validator_id: string;
          verdict: "exists" | "not_exists";
          quality: number | null;
          media: Json | null;
          captured_lat: number | null;
          captured_lng: number | null;
          captured_at: string | null;
          geo_ok: boolean | null;
          independence_ok: boolean | null;
          anomaly: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          bounty_id: string;
          validator_id: string;
          verdict: "exists" | "not_exists";
          quality?: number | null;
          media?: Json | null;
          captured_lat?: number | null;
          captured_lng?: number | null;
          captured_at?: string | null;
          geo_ok?: boolean | null;
          independence_ok?: boolean | null;
          anomaly?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          bounty_id?: string;
          validator_id?: string;
          verdict?: "exists" | "not_exists";
          quality?: number | null;
          media?: Json | null;
          captured_lat?: number | null;
          captured_lng?: number | null;
          captured_at?: string | null;
          geo_ok?: boolean | null;
          independence_ok?: boolean | null;
          anomaly?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      scout_verification_audit: {
        Row: {
          id: string;
          bounty_id: string;
          admin_id: string | null;
          decision: "publish" | "reject";
          active_validators: number | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          bounty_id: string;
          admin_id?: string | null;
          decision: "publish" | "reject";
          active_validators?: number | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          bounty_id?: string;
          admin_id?: string | null;
          decision?: "publish" | "reject";
          active_validators?: number | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      appeal_grievance: {
        Args: { p_id: string };
        Returns: undefined;
      };
      create_bounty: {
        Args: {
          p_type: string;
          p_submission_id?: string | null;
          p_quest_id?: string | null;
          p_area?: string | null;
          p_city?: string | null;
          p_lister_id?: string | null;
          p_bounty_points?: number;
        };
        Returns: string;
      };
      submit_confirmation: {
        Args: {
          p_bounty_id: string;
          p_verdict: string;
          p_quality?: number | null;
          p_media?: Json | null;
          p_captured_lat?: number | null;
          p_captured_lng?: number | null;
          p_captured_at?: string | null;
        };
        Returns: string;
      };
      aggregate_verdict: {
        Args: { p_bounty_id: string };
        Returns: undefined;
      };
      award_points_escrow: {
        Args: {
          p_user_id: string;
          p_delta: number;
          p_reason: string;
          p_ref_type?: string | null;
          p_ref_id?: string | null;
        };
        Returns: string;
      };
      confirm_points: {
        Args: { p_ref_type: string; p_ref_id: string };
        Returns: undefined;
      };
      clawback_points: {
        Args: { p_ref_type: string; p_ref_id: string; p_reason?: string };
        Returns: undefined;
      };
      grant_threshold: {
        Args: { p_user_id: string; p_threshold_id: string };
        Returns: undefined;
      };
      spawn_verify_bounty: {
        Args: { p_place_id: string; p_bounty_points?: number };
        Returns: string;
      };
      geo_distance_m: {
        Args: { lat1: number; lng1: number; lat2: number; lng2: number };
        Returns: number;
      };
      can_validate: {
        Args: { p_user: string };
        Returns: boolean;
      };
      points_balance: {
        Args: { p_user: string };
        Returns: number;
      };
      points_escrowed: {
        Args: { p_user: string };
        Returns: number;
      };
      scout_metric: {
        Args: { p_user: string; p_metric: string };
        Returns: number;
      };
      check_reward_thresholds: {
        Args: { p_user: string };
        Returns: undefined;
      };
      area_validator_density: {
        Args: { p_city?: string | null };
        Returns: {
          city: string;
          open_bounties: number;
          active_validators: number;
          thin: boolean;
        }[];
      };
      admin_resolve_bounty: {
        Args: { p_bounty_id: string; p_decision: string; p_note?: string | null };
        Returns: undefined;
      };
      admin_create_discover_bounty: {
        Args: { p_area: string | null; p_city: string; p_bounty_points?: number };
        Returns: string;
      };
      admin_grant_validator: {
        Args: { target: string };
        Returns: undefined;
      };
      scout_leaderboard: {
        Args: { p_limit?: number };
        Returns: {
          user_id: string;
          display_name: string | null;
          avatar_url: string | null;
          curator_score: number;
          verified_spots: number;
        }[];
      };
      metrics_accept_rate: {
        Args: { p_days?: number; p_window_minutes?: number };
        Returns: { asks: number; accepts: number }[];
      };
      metrics_answer_accept_rate: {
        Args: { p_days?: number };
        Returns: { served: number; accepted: number }[];
      };
      metrics_activation: {
        Args: { p_days?: number };
        Returns: {
          served: number;
          accepted: number;
          avg_ttfa_seconds: number | null;
        }[];
      };
      metrics_reason_source: {
        Args: { p_days?: number };
        Returns: { model: number; editor_note: number; degraded: number }[];
      };
      active_experiments: {
        Args: Record<PropertyKey, never>;
        Returns: { key: string; variants: string[] }[];
      };
      metrics_experiment: {
        Args: { p_key: string; p_days?: number };
        Returns: { variant: string; served: number; accepted: number }[];
      };
      metrics_daily: {
        Args: { p_days?: number };
        Returns: {
          day: string;
          asks: number;
          accepts: number;
          active_users: number;
        }[];
      };
      metrics_funnel: {
        Args: { p_days?: number };
        Returns: { stage: string; n: number; ord: number }[];
      };
      metrics_retention: {
        Args: { p_weeks?: number };
        Returns: {
          cohort_week: string;
          cohort_size: number;
          d1: number;
          d7: number;
          d30: number;
        }[];
      };
      is_csam_staff: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      hidden_user_ids: {
        Args: Record<PropertyKey, never>;
        Returns: string[];
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
      public_profile: {
        Args: { candidate: string };
        Returns: {
          id: string;
          username: string | null;
          display_name: string | null;
          avatar_url: string | null;
          outsider_number: number | null;
        }[];
      };
      set_taste_card_public: {
        Args: { p_public: boolean };
        Returns: undefined;
      };
      public_taste_card: {
        Args: { p_username: string };
        Returns: {
          username: string | null;
          display_name: string | null;
          outsider_number: number | null;
          home_city: string | null;
          taste_summary: string | null;
          vibe_keywords: Json;
        }[];
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
