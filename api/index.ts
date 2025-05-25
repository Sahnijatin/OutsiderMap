import express, { Request, Response, Application, RequestHandler } from 'express';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { Database } from '../src/lib/database.types'; // Assuming database.types.ts is in src/lib
import { handleAiSuggestion } from '../src/lib/ai/suggest';

dotenv.config();

const app = express(); // Removed explicit Application type
const port = process.env.PORT || 3001;

app.use(express.json());

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

// Types from database.types.ts (copied for backend use)
type Place = Database['public']['Tables']['places']['Row'];
type VibeType = Database['public']['Enums']['vibe_type'];
type SpotType = Database['public']['Enums']['spot_type'];
type PriceRange = Database['public']['Enums']['price_range'];
type UserPreferences = Database['public']['Tables']['user_preferences']['Row'];

interface SearchCriteria {
  vibes?: VibeType[];
  types?: SpotType[];
  priceRanges?: PriceRange[];
  keywords?: string[];
  location?: string;
}

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

async function analyzeUserQuery(query: string): Promise<SearchCriteria> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // Using 4o as requested
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
    throw new Error('Failed to analyze your request.');
  }
}

async function generateResponse(
  query: string,
  places: Place[],
  userPreferences?: UserPreferences
): Promise<string> {
  try {
    const placesContext = places.map(place => ({
      name: place.name,
      description: place.description,
      vibe: place.vibe,
      type: place.type,
      price_range: place.price_range,
      address: place.address
    }));

    const userContext = userPreferences ? `
User Preferences:
- Preferred Vibes: ${userPreferences.preferred_vibes.join(', ')}
- Preferred Types: ${userPreferences.preferred_types.join(', ')}
- Preferred Price Ranges: ${userPreferences.preferred_price_ranges.join(', ')}
` : '';

    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // Using 4o as requested
      messages: [
        {
          role: "system",
          content: `You are a friendly and knowledgeable guide for Delhi's best places.
${userContext}
Provide personalized recommendations based on the available places and user preferences.
Be conversational, enthusiastic, and specific about why each place might interest the user.
Include relevant details like vibe, price range, and location.
If no places match the criteria exactly, suggest the closest matches and explain why they might be interesting.`
        },
        {
          role: "user",
          content: `User Query: ${query}\n\nAvailable Places: ${JSON.stringify(placesContext, null, 2)}`
        }
      ]
    });

    return completion.choices[0].message.content || 'I found some interesting places for you!';
  } catch (error) {
    console.error('Error generating response:', error);
    throw new Error('Failed to generate recommendations.');
  }
}

async function searchLocations(criteria: {
  vibes?: string[];
  types?: string[];
  priceRanges?: string[];
  keywords?: string[];
  location?: string;
  userLocation?: {
    latitude: number;
    longitude: number;
  };
}): Promise<Place[]> {
  try {
    let query = supabase
      .from('places')
      .select('*')
      .eq('status', 'approved');

    // Apply filters
    if (criteria.vibes?.length) {
      query = query.in('vibe', criteria.vibes);
    }
    if (criteria.types?.length) {
      query = query.in('type', criteria.types);
    }
    if (criteria.priceRanges?.length) {
      query = query.in('price_range', criteria.priceRanges);
    }
    if (criteria.keywords?.length) {
      const keywordFilter = criteria.keywords
        .map(k => `or(name.ilike.%${k}%,description.ilike.%${k}%)`)
        .join(',');
      query = query.or(keywordFilter);
    }

    // If user location is provided, we'll sort by distance after fetching
    const { data, error } = await query.limit(20); // Increased limit for better distance-based filtering

    if (error) throw error;

    let places = data || [];

    // If user location is provided, sort places by distance
    if (criteria.userLocation) {
      places = places.sort((a, b) => {
        const distanceA = calculateDistance(
          criteria.userLocation!.latitude,
          criteria.userLocation!.longitude,
          a.latitude,
          a.longitude
        );
        const distanceB = calculateDistance(
          criteria.userLocation!.latitude,
          criteria.userLocation!.longitude,
          b.latitude,
          b.longitude
        );
        return distanceA - distanceB;
      }).slice(0, 10); // Take top 10 closest places
    }

    return places;
  } catch (error) {
    console.error('Error searching locations:', error);
    return [];
  }
}

// Helper function to calculate distance between two points using Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

// Define the type for the async route handler, allowing for Response return
type AsyncRequestHandler = (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | void>;

// AI Suggestion Endpoint
const aiSuggestHandler: AsyncRequestHandler = async (req, res) => {
  const { query, userId, userLocation } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Missing query' });
  }

  try {
    // 1. Get user preferences if userId is provided
    let userPreferences: UserPreferences | null = null;
    if (userId) {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
        throw error;
      }
      userPreferences = data;
    }

    // 2. Analyze user query
    const searchCriteria = await analyzeUserQuery(query);

    // 3. Search for locations based on criteria and user location
    const locations = await searchLocations({
      ...searchCriteria,
      userLocation
    });

    // 4. Generate AI response using the integrated logic
    // Instead of handleAiSuggestion, generate the response here for correct structure
    const aiText = await generateResponse(query, locations, userPreferences || undefined);

    // 5. Map locations to cards (ensure images is always an array)
    const cards = (locations || []).map(location => ({
      id: location.id,
      name: location.name,
      description: location.description,
      image: location.images?.[0] || '/location-placeholder.jpg',
      images: location.images || [],
      address: location.address || 'Not specified',
      price_range: location.price_range,
      vibe: location.vibe,
      type: location.type,
      opening_hours: typeof location.opening_hours === 'string'
        ? location.opening_hours
        : Array.isArray(location.opening_hours)
          ? location.opening_hours.join(', ')
          : 'Not specified',
    }));

    // 6. Send response back to frontend in the expected structure
    return res.json({
      aiResponse: {
        text: aiText,
        cards
      }
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message || 'An unexpected error occurred' });
  }
};

app.post('/ai-suggest', aiSuggestHandler as RequestHandler);

app.listen(port, () => {
  console.log(`Backend server listening on port ${port}`);
}); 