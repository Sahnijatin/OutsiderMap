import { supabase } from '@/lib/supabase';
import { Database } from '@/lib/database.types';

type Spot = Database['public']['Tables']['spots']['Row'];
type VibeType = Database['public']['Enums']['vibe_type'];
type SpotType = Database['public']['Enums']['spot_type'];
type PriceRange = Database['public']['Enums']['price_range'];

interface SearchCriteria {
  vibes?: VibeType[];
  types?: SpotType[];
  priceRanges?: PriceRange[];
  keywords?: string[];
  location?: string;
  timeOfDay?: string;
  specialRequirements?: string[];
}

interface UserPreferences {
  preferred_vibes: VibeType[];
  preferred_types: SpotType[];
  preferred_price_ranges: PriceRange[];
}

export class LocationExpertAgent {
  async findLocations(
    criteria: SearchCriteria,
    userPreferences?: UserPreferences
  ): Promise<Spot[]> {
    try {
      let query = supabase.from('spots').select('*');

      // Apply filters based on criteria
      if (criteria.vibes?.length) {
        query = query.in('vibe', criteria.vibes);
      }
      if (criteria.types?.length) {
        query = query.in('type', criteria.types);
      }
      if (criteria.priceRanges?.length) {
        query = query.in('price_range', criteria.priceRanges);
      }
      if (criteria.location) {
        query = query.ilike('address', `%${criteria.location}%`);
      }

      // Add user preferences as additional context
      if (userPreferences) {
        // We'll use these preferences to rank results later
        // Get all matching spots
        const { data: spots, error } = await query;
        if (error) throw error;
        return this.rankSpotsByPreferences(spots || [], userPreferences);
      }

      const { data: spots, error } = await query;
      if (error) throw error;
      return spots || [];
    } catch (error) {
      console.error('Error finding locations:', error);
      throw new Error('Failed to find locations');
    }
  }

  private rankSpotsByPreferences(
    spots: Spot[],
    preferences: UserPreferences
  ): Spot[] {
    return spots.sort((a, b) => {
      const scoreA = this.calculatePreferenceScore(a, preferences);
      const scoreB = this.calculatePreferenceScore(b, preferences);
      return scoreB - scoreA;
    });
  }

  private calculatePreferenceScore(spot: Spot, preferences: UserPreferences): number {
    let score = 0;
    if (preferences.preferred_vibes.includes(spot.vibe)) score += 3;
    if (preferences.preferred_types.includes(spot.type)) score += 2;
    if (preferences.preferred_price_ranges.includes(spot.price_range)) score += 1;
    return score;
  }
} 