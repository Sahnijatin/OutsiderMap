import { supabase } from '@/lib/supabase';
import { Database } from '@/lib/database.types';

type Place = Database['public']['Tables']['places']['Row'];
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
    userPreferences?: UserPreferences,
    userLocation?: {
      latitude: number;
      longitude: number;
    }
  ): Promise<Place[]> {
    try {
      let query = supabase.from('places').select('*');

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

      // Get all matching places
      const { data: places, error } = await query;
      if (error) throw error;

      let filteredPlaces = places || [];

      // If user location is provided, sort by distance
      if (userLocation) {
        filteredPlaces = filteredPlaces.sort((a, b) => {
          const distanceA = this.calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            a.latitude,
            a.longitude
          );
          const distanceB = this.calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            b.latitude,
            b.longitude
          );
          return distanceA - distanceB;
        });
      }

      // Apply user preferences ranking if available
      if (userPreferences) {
        filteredPlaces = this.rankPlacesByPreferences(filteredPlaces, userPreferences);
      }

      return filteredPlaces;
    } catch (error) {
      console.error('Error finding locations:', error);
      throw new Error('Failed to find locations');
    }
  }

  private rankPlacesByPreferences(
    places: Place[],
    preferences: UserPreferences
  ): Place[] {
    return places.sort((a, b) => {
      const scoreA = this.calculatePreferenceScore(a, preferences);
      const scoreB = this.calculatePreferenceScore(b, preferences);
      return scoreB - scoreA;
    });
  }

  private calculatePreferenceScore(place: Place, preferences: UserPreferences): number {
    let score = 0;
    if (preferences.preferred_vibes.includes(place.vibe)) score += 3;
    if (preferences.preferred_types.includes(place.type)) score += 2;
    if (preferences.preferred_price_ranges.includes(place.price_range)) score += 1;
    return score;
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
} 