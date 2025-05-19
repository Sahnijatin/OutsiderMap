import OpenAI from 'openai';
import { Database } from './database.types';

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
}

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are an AI assistant helping users find the perfect places to visit in Delhi.
Your task is to understand user queries and extract relevant search criteria.
Consider the following aspects:
- Vibe: chill, artsy, wild, romantic, foodie
- Type: cafe, restaurant, bar, park, museum, other
- Price Range: budget, moderate, expensive
- Location preferences
- Time of day
- Special requirements (e.g., family-friendly, pet-friendly)

Respond with a JSON object containing the extracted criteria.`;

export async function analyzeUserQuery(query: string): Promise<SearchCriteria> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: query }
      ],
      response_format: { type: "json_object" }
    });

    const response = JSON.parse(completion.choices[0].message.content || '{}');
    return response as SearchCriteria;
  } catch (error) {
    console.error('Error analyzing user query:', error);
    throw new Error('Failed to analyze your request. Please try again.');
  }
}

export async function generateResponse(
  query: string,
  spots: Spot[],
  userPreferences?: {
    preferred_vibes: VibeType[];
    preferred_types: SpotType[];
    preferred_price_ranges: PriceRange[];
  }
): Promise<string> {
  try {
    const spotsContext = spots.map(spot => ({
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

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are a friendly and knowledgeable guide for Delhi's best spots.
${userContext}
Provide personalized recommendations based on the available spots and user preferences.
Be conversational, enthusiastic, and specific about why each place might interest the user.
Include relevant details like vibe, price range, and location.
If no spots match the criteria exactly, suggest the closest matches and explain why they might be interesting.`
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
    throw new Error('Failed to generate recommendations. Please try again.');
  }
} 