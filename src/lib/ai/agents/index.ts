import { LocationExpertAgent } from './locationExpert';
import { UserPreferenceAgent } from './userPreference';
import { ContextUnderstandingAgent } from './contextUnderstanding';
import { ValidationAgent } from './validation';
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

export class OrchestratorAgent {
  private agents: {
    locationExpert: LocationExpertAgent;
    userPreference: UserPreferenceAgent;
    contextUnderstanding: ContextUnderstandingAgent;
    validation: ValidationAgent;
  };

  constructor() {
    this.agents = {
      locationExpert: new LocationExpertAgent(),
      userPreference: new UserPreferenceAgent(),
      contextUnderstanding: new ContextUnderstandingAgent(),
      validation: new ValidationAgent(),
    };
  }

  async processQuery(
    query: string,
    userPreferences?: UserPreferences,
    conversationHistory?: { role: string; content: string }[],
    userLocation?: {
      latitude: number;
      longitude: number;
    }
  ): Promise<{
    response: string;
    locations: Place[];
    searchCriteria: SearchCriteria;
  }> {
    // 1. Understand context and extract criteria
    const contextAnalysis = await this.agents.contextUnderstanding.analyze(
      query,
      conversationHistory
    );

    // 2. Validate and enrich search criteria
    const validatedCriteria = await this.agents.validation.validate(
      contextAnalysis.criteria
    );

    // 3. Get location recommendations
    const locations = await this.agents.locationExpert.findLocations(
      validatedCriteria,
      userPreferences,
      userLocation
    );

    // 4. Generate personalized response
    const response = await this.agents.userPreference.generateResponse(
      query,
      locations,
      userPreferences,
      contextAnalysis
    );

    return {
      response,
      locations,
      searchCriteria: validatedCriteria,
    };
  }
} 