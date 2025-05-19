import { Database } from '@/lib/database.types';
import OpenAI from 'openai';

type Spot = Database['public']['Tables']['spots']['Row'];
type VibeType = Database['public']['Enums']['vibe_type'];
type SpotType = Database['public']['Enums']['spot_type'];
type PriceRange = Database['public']['Enums']['price_range'];

interface UserPreferences {
  preferred_vibes: VibeType[];
  preferred_types: SpotType[];
  preferred_price_ranges: PriceRange[];
}

interface ContextAnalysis {
  criteria: {
    vibes?: VibeType[];
    types?: SpotType[];
    priceRanges?: PriceRange[];
    keywords?: string[];
    location?: string;
    timeOfDay?: string;
    specialRequirements?: string[];
  };
  intent: string;
  sentiment: string;
  timeContext?: string;
}

export class UserPreferenceAgent {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: import.meta.env.VITE_OPENAI_API_KEY,
    });
  }

  async generateResponse(
    query: string,
    locations: Spot[],
    userPreferences?: UserPreferences,
    contextAnalysis?: ContextAnalysis
  ): Promise<string> {
    try {
      const spotsContext = locations.map(spot => ({
        name: spot.name,
        description: spot.description,
        vibe: spot.vibe,
        type: spot.type,
        price_range: spot.price_range,
        address: spot.address
      }));

      const userContext = userPreferences ? `
User Preferences:
- Preferred Vibes: ${userPreferences.preferred_vibes.join(', ')}
- Preferred Types: ${userPreferences.preferred_types.join(', ')}
- Preferred Price Ranges: ${userPreferences.preferred_price_ranges.join(', ')}
` : '';

      const contextInfo = contextAnalysis ? `
Context Analysis:
- Intent: ${contextAnalysis.intent}
- Sentiment: ${contextAnalysis.sentiment}
- Time Context: ${contextAnalysis.timeContext || 'Not specified'}
- Special Requirements: ${contextAnalysis.criteria.specialRequirements?.join(', ') || 'None'}
` : '';

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `You are a friendly and knowledgeable guide for Delhi's best spots.
${userContext}
${contextInfo}
Provide personalized recommendations based on the available spots and user preferences.
Be conversational, enthusiastic, and specific about why each place might interest the user.
Include relevant details like vibe, price range, and location.
If no spots match the criteria exactly, suggest the closest matches and explain why they might be interesting.
Consider the time of day and any special requirements mentioned.
Make the response engaging and natural, as if you're having a conversation with a friend.`
          },
          {
            role: "user",
            content: `User Query: ${query}\n\nAvailable Spots: ${JSON.stringify(spotsContext, null, 2)}`
          }
        ]
      });

      return completion.choices[0].message.content || 'I found some interesting places for you!';
    } catch (error) {
      console.error('Error generating response:', error);
      throw new Error('Failed to generate recommendations');
    }
  }
} 