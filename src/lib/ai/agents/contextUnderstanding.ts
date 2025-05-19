import { Database } from '@/lib/database.types';
import OpenAI from 'openai';

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

interface ContextAnalysis {
  criteria: SearchCriteria;
  intent: string;
  sentiment: string;
  timeContext?: string;
}

export class ContextUnderstandingAgent {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: import.meta.env.VITE_OPENAI_API_KEY,
    });
  }

  async analyze(
    query: string,
    conversationHistory?: { role: string; content: string }[]
  ): Promise<ContextAnalysis> {
    try {
      const messages = [
        {
          role: "system",
          content: `You are an expert in understanding user queries about places to visit in Delhi.
Analyze the query and extract:
1. Explicit and implicit search criteria
2. User intent
3. Sentiment
4. Time context
5. Special requirements

Consider the following aspects:
- Vibe: chill, artsy, wild, romantic, foodie
- Type: cafe, restaurant, bar, park, museum, other
- Price Range: budget, moderate, expensive
- Location preferences
- Time of day
- Special requirements (e.g., family-friendly, pet-friendly)

Respond with a JSON object containing the analysis.`
        },
        ...(conversationHistory || []),
        { role: "user", content: query }
      ];

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages,
        response_format: { type: "json_object" }
      });

      const response = JSON.parse(completion.choices[0].message.content || '{}');
      
      return {
        criteria: {
          vibes: response.vibes,
          types: response.types,
          priceRanges: response.priceRanges,
          keywords: response.keywords,
          location: response.location,
          timeOfDay: response.timeOfDay,
          specialRequirements: response.specialRequirements
        },
        intent: response.intent,
        sentiment: response.sentiment,
        timeContext: response.timeContext
      };
    } catch (error) {
      console.error('Error analyzing context:', error);
      throw new Error('Failed to analyze query context');
    }
  }
} 