/**
 * Supabase database types, handwritten to mirror
 * supabase/migrations/. Once a live project exists, regenerate with:
 *
 *   npx supabase gen types typescript --linked > src/types/database.ts
 *
 * pgvector columns surface as strings over PostgREST — serialize embeddings
 * with JSON.stringify(numbers) when writing.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

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
          onboarding_completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          home_area?: string | null;
          is_admin?: boolean;
          onboarding_completed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          home_area?: string | null;
          is_admin?: boolean;
          onboarding_completed_at?: string | null;
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
          source: "curated" | "submitted";
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
          source?: "curated" | "submitted";
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
          source?: "curated" | "submitted";
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
          created_at: string;
        };
        Insert: {
          user_id: string;
          place_id: string;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          place_id?: string;
          note?: string | null;
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
          event_type:
            | "query"
            | "view"
            | "save"
            | "unsave"
            | "rate"
            | "visit"
            | "dismiss"
            | "plan_add"
            | "rec_click";
          place_id: string | null;
          event_id: string | null;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: never;
          user_id: string;
          event_type:
            | "query"
            | "view"
            | "save"
            | "unsave"
            | "rate"
            | "visit"
            | "dismiss"
            | "plan_add"
            | "rec_click";
          place_id?: string | null;
          event_id?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: never;
          user_id?: string;
          event_type?:
            | "query"
            | "view"
            | "save"
            | "unsave"
            | "rate"
            | "visit"
            | "dismiss"
            | "plan_add"
            | "rec_click";
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
          status: "pending" | "accepted" | "rejected";
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
          status?: "pending" | "accepted" | "rejected";
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
          status?: "pending" | "accepted" | "rejected";
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
      is_premium: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
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
