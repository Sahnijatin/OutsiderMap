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

export class ValidationAgent {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: import.meta.env.VITE_OPENAI_API_KEY,
    });
  }

  async validate(criteria: SearchCriteria): Promise<SearchCriteria> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `You are an expert in validating and enriching search criteria for Delhi locations.
Validate the provided criteria and suggest any relevant additions or modifications.
Consider:
1. Time of day implications
2. Weather considerations
3. Cultural context
4. Local knowledge
5. Special requirements

Respond with a JSON object containing the validated and enriched criteria.`
          },
          {
            role: "user",
            content: `Validate and enrich these search criteria: ${JSON.stringify(criteria, null, 2)}`
          }
        ],
        response_format: { type: "json_object" }
      });

      const response = JSON.parse(completion.choices[0].message.content || '{}');
      
      return {
        vibes: response.vibes || criteria.vibes,
        types: response.types || criteria.types,
        priceRanges: response.priceRanges || criteria.priceRanges,
        keywords: response.keywords || criteria.keywords,
        location: response.location || criteria.location,
        timeOfDay: response.timeOfDay || criteria.timeOfDay,
        specialRequirements: response.specialRequirements || criteria.specialRequirements
      };
    } catch (error) {
      console.error('Error validating criteria:', error);
      // Return original criteria if validation fails
      return criteria;
    }
  }

  private validateTimeOfDay(timeOfDay?: string): string | undefined {
    if (!timeOfDay) return undefined;
    const validTimes = ['morning', 'afternoon', 'evening', 'night', 'late-night'];
    const normalizedTime = timeOfDay.toLowerCase().trim();
    if (validTimes.includes(normalizedTime)) return normalizedTime;
    const timeMatch = normalizedTime.match(/(\d{1,2})(?::\d{2})?\s*(am|pm)/i);
    if (timeMatch) {
      const hour = parseInt(timeMatch[1]);
      const isPM = timeMatch[2].toLowerCase() === 'pm';
      const hour24 = isPM ? (hour === 12 ? 12 : hour + 12) : (hour === 12 ? 0 : hour);
      if (hour24 >= 5 && hour24 < 12) return 'morning';
      if (hour24 >= 12 && hour24 < 17) return 'afternoon';
      if (hour24 >= 17 && hour24 < 22) return 'evening';
      if (hour24 >= 22 || hour24 < 5) return 'late-night';
    }
    return undefined;
  }

  private validateLocation(location?: string): string | undefined {
    if (!location) return undefined;
    const delhiAreas = [
      'connaught place', 'cp', 'hauz khas', 'gk', 'greater kailash',
      'chandni chowk', 'khan market', 'lajpat nagar', 'defence colony',
      'saket', 'vasant kunj', 'rohini', 'pitampura', 'dwarka'
    ];
    const normalizedLocation = location.toLowerCase().trim();
    const matchedArea = delhiAreas.find(area => 
      normalizedLocation.includes(area) || area.includes(normalizedLocation)
    );
    return matchedArea || location;
  }
} 