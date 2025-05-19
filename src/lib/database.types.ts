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
      spots: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string
          address: string
          vibe: 'chill' | 'artsy' | 'wild' | 'romantic' | 'foodie'
          type: 'cafe' | 'restaurant' | 'bar' | 'park' | 'museum' | 'other'
          price_range: 'budget' | 'moderate' | 'expensive'
          opening_hours: string | null
          contact_info: string | null
          images: string[]
          status: 'pending' | 'approved' | 'rejected'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description: string
          address: string
          vibe: 'chill' | 'artsy' | 'wild' | 'romantic' | 'foodie'
          type: 'cafe' | 'restaurant' | 'bar' | 'park' | 'museum' | 'other'
          price_range: 'budget' | 'moderate' | 'expensive'
          opening_hours?: string | null
          contact_info?: string | null
          images?: string[]
          status?: 'pending' | 'approved' | 'rejected'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          description?: string
          address?: string
          vibe?: 'chill' | 'artsy' | 'wild' | 'romantic' | 'foodie'
          type?: 'cafe' | 'restaurant' | 'bar' | 'park' | 'museum' | 'other'
          price_range?: 'budget' | 'moderate' | 'expensive'
          opening_hours?: string | null
          contact_info?: string | null
          images?: string[]
          status?: 'pending' | 'approved' | 'rejected'
          created_at?: string
          updated_at?: string
        }
      }
      chat_history: {
        Row: {
          id: string
          user_id: string
          user_message: string
          ai_response: string | null
          locations: string[] | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          user_message: string
          ai_response?: string | null
          locations?: string[] | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          user_message?: string
          ai_response?: string | null
          locations?: string[] | null
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
          spot_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          spot_id: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          spot_id?: string
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