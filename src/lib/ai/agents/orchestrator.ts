import { ContextUnderstandingAgent } from './contextUnderstanding';
import { LocationExpertAgent } from './locationExpert';
import { UserPreferenceAgent } from './userPreference';
import { Database } from '@/lib/database.types';

type Place = Database['public']['Tables']['places']['Row'];
type UserPreferences = {
  preferred_vibes: Database['public']['Enums']['vibe_type'][];
  preferred_types: Database['public']['Enums']['spot_type'][];
  preferred_price_ranges: Database['public']['Enums']['price_range'][];
};

export class OrchestratorAgent {
  private contextUnderstanding: ContextUnderstandingAgent;
  private locationExpert: LocationExpertAgent;
  private userPreference: UserPreferenceAgent;

  constructor() {
    this.contextUnderstanding = new ContextUnderstandingAgent();
    this.locationExpert = new LocationExpertAgent();
    this.userPreference = new UserPreferenceAgent();
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
  }> {
    try {
      // 1. Analyze context
      const contextAnalysis = await this.contextUnderstanding.analyze(
        query,
        conversationHistory
      );

      // 2. Find relevant locations
      const locations = await this.locationExpert.findLocations(
        contextAnalysis.criteria,
        userPreferences,
        userLocation
      );

      // 3. Generate response
      const response = await this.userPreference.generateResponse(
        query,
        locations,
        userPreferences,
        contextAnalysis
      );

      return {
        response,
        locations,
      };
    } catch (error) {
      console.error('Error in orchestrator:', error);
      throw new Error('Failed to process your request');
    }
  }
} 