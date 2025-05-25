export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      places: {
        Row: {
          id: string
          name: string
          description: string
          address: string
          latitude: number | null
          longitude: number | null
          area: string | null
          vibe: 'chill' | 'artsy' | 'wild' | 'romantic' | 'foodie'
          type: 'cafe' | 'restaurant' | 'bar' | 'park' | 'museum' | 'other'
          price_range: 'budget' | 'moderate' | 'expensive'
          opening_hours: Json | null
          contact_info: Json | null
          images: string[]
          amenities: string[]
          rating: number
          review_count: number
          status: 'pending' | 'approved' | 'rejected'
          featured: boolean
          user_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description: string
          address: string
          latitude?: number | null
          longitude?: number | null
          area?: string | null
          vibe: 'chill' | 'artsy' | 'wild' | 'romantic' | 'foodie'
          type: 'cafe' | 'restaurant' | 'bar' | 'park' | 'museum' | 'other'
          price_range: 'budget' | 'moderate' | 'expensive'
          opening_hours?: Json | null
          contact_info?: Json | null
          images?: string[]
          amenities?: string[]
          rating?: number
          review_count?: number
          status?: 'pending' | 'approved' | 'rejected'
          featured?: boolean
          user_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string
          address?: string
          latitude?: number | null
          longitude?: number | null
          area?: string | null
          vibe?: 'chill' | 'artsy' | 'wild' | 'romantic' | 'foodie'
          type?: 'cafe' | 'restaurant' | 'bar' | 'park' | 'museum' | 'other'
          price_range?: 'budget' | 'moderate' | 'expensive'
          opening_hours?: Json | null
          contact_info?: Json | null
          images?: string[]
          amenities?: string[]
          rating?: number
          review_count?: number
          status?: 'pending' | 'approved' | 'rejected'
          featured?: boolean
          user_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      vibes: {
        Row: {
          id: string
          name: string
          display_name: string
          description: string | null
          icon: string
          color: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          display_name: string
          description?: string | null
          icon: string
          color: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          display_name?: string
          description?: string | null
          icon?: string
          color?: string
          created_at?: string
        }
      }
      weekend_plans: {
        Row: {
          id: string
          title: string
          description: string | null
          theme: string | null
          day1_places: string[]
          day2_places: string[]
          day1_description: string | null
          day2_description: string | null
          estimated_budget: number | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          theme?: string | null
          day1_places?: string[]
          day2_places?: string[]
          day1_description?: string | null
          day2_description?: string | null
          estimated_budget?: number | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          theme?: string | null
          day1_places?: string[]
          day2_places?: string[]
          day1_description?: string | null
          day2_description?: string | null
          estimated_budget?: number | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      blog_posts: {
        Row: {
          id: string
          slug: string
          title: string
          excerpt: string | null
          content: string
          featured_image: string | null
          images: string[]
          tags: string[]
          related_places: string[]
          author_id: string | null
          published: boolean
          published_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          title: string
          excerpt?: string | null
          content: string
          featured_image?: string | null
          images?: string[]
          tags?: string[]
          related_places?: string[]
          author_id?: string | null
          published?: boolean
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          title?: string
          excerpt?: string | null
          content?: string
          featured_image?: string | null
          images?: string[]
          tags?: string[]
          related_places?: string[]
          author_id?: string | null
          published?: boolean
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      newsletter_subscribers: {
        Row: {
          id: string
          email: string
          name: string | null
          preferences: Json
          subscribed: boolean
          verified: boolean
          verification_token: string | null
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          name?: string | null
          preferences?: Json
          subscribed?: boolean
          verified?: boolean
          verification_token?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          name?: string | null
          preferences?: Json
          subscribed?: boolean
          verified?: boolean
          verification_token?: string | null
          created_at?: string
        }
      }
      submissions: {
        Row: {
          id: string
          user_id: string | null
          name: string
          description: string
          address: string
          suggested_vibe: 'chill' | 'artsy' | 'wild' | 'romantic' | 'foodie' | null
          suggested_type: 'cafe' | 'restaurant' | 'bar' | 'park' | 'museum' | 'other' | null
          suggested_price_range: 'budget' | 'moderate' | 'expensive' | null
          contact_info: string | null
          images: string[]
          admin_notes: string | null
          status: string
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          name: string
          description: string
          address: string
          suggested_vibe?: 'chill' | 'artsy' | 'wild' | 'romantic' | 'foodie' | null
          suggested_type?: 'cafe' | 'restaurant' | 'bar' | 'park' | 'museum' | 'other' | null
          suggested_price_range?: 'budget' | 'moderate' | 'expensive' | null
          contact_info?: string | null
          images?: string[]
          admin_notes?: string | null
          status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          name?: string
          description?: string
          address?: string
          suggested_vibe?: 'chill' | 'artsy' | 'wild' | 'romantic' | 'foodie' | null
          suggested_type?: 'cafe' | 'restaurant' | 'bar' | 'park' | 'museum' | 'other' | null
          suggested_price_range?: 'budget' | 'moderate' | 'expensive' | null
          contact_info?: string | null
          images?: string[]
          admin_notes?: string | null
          status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
        }
      }
      reviews: {
        Row: {
          id: string
          place_id: string
          user_id: string | null
          rating: number
          comment: string | null
          images: string[]
          helpful_count: number
          created_at: string
        }
        Insert: {
          id?: string
          place_id: string
          user_id?: string | null
          rating: number
          comment?: string | null
          images?: string[]
          helpful_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          place_id?: string
          user_id?: string | null
          rating?: number
          comment?: string | null
          images?: string[]
          helpful_count?: number
          created_at?: string
        }
      }
      analytics_events: {
        Row: {
          id: string
          event_type: string
          user_id: string | null
          place_id: string | null
          metadata: Json
          session_id: string | null
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          event_type: string
          user_id?: string | null
          place_id?: string | null
          metadata?: Json
          session_id?: string | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          event_type?: string
          user_id?: string | null
          place_id?: string | null
          metadata?: Json
          session_id?: string | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
      }
      chat_history: {
        Row: {
          id: string
          user_id: string
          user_message: string
          ai_response: string | null
          location_ids: string[] | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          user_message: string
          ai_response?: string | null
          location_ids?: string[] | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          user_message?: string
          ai_response?: string | null
          location_ids?: string[] | null
          created_at?: string
        }
      }
      user_preferences: {
        Row: {
          id: string
          user_id: string
          preferred_vibes: ('chill' | 'artsy' | 'wild' | 'romantic' | 'foodie')[]
          preferred_types: ('cafe' | 'restaurant' | 'bar' | 'park' | 'museum' | 'other')[]
          preferred_price_ranges: ('budget' | 'moderate' | 'expensive')[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          preferred_vibes?: ('chill' | 'artsy' | 'wild' | 'romantic' | 'foodie')[]
          preferred_types?: ('cafe' | 'restaurant' | 'bar' | 'park' | 'museum' | 'other')[]
          preferred_price_ranges?: ('budget' | 'moderate' | 'expensive')[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          preferred_vibes?: ('chill' | 'artsy' | 'wild' | 'romantic' | 'foodie')[]
          preferred_types?: ('cafe' | 'restaurant' | 'bar' | 'park' | 'museum' | 'other')[]
          preferred_price_ranges?: ('budget' | 'moderate' | 'expensive')[]
          created_at?: string
          updated_at?: string
        }
      }
      favorites: {
        Row: {
          id: string
          user_id: string
          place_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          place_id: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          place_id?: string
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      spot_status: 'pending' | 'approved' | 'rejected'
      price_range: 'budget' | 'moderate' | 'expensive'
      spot_type: 'cafe' | 'restaurant' | 'bar' | 'park' | 'museum' | 'other'
      vibe_type: 'chill' | 'artsy' | 'wild' | 'romantic' | 'foodie'
    }
  }
} 