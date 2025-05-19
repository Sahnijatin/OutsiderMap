import express, { Request, Response, Application, RequestHandler } from 'express';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { Database } from '../src/lib/database.types'; // Assuming database.types.ts is in src/lib

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
type Spot = Database['public']['Tables']['spots']['Row'];
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
  spots: Spot[],
  userPreferences?: UserPreferences
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
      model: "gpt-4o", // Using 4o as requested
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
    throw new Error('Failed to generate recommendations.');
  }
}

async function searchLocations(criteria: {
  vibes?: string[];
  types?: string[];
  priceRanges?: string[];
  keywords?: string[];
  location?: string;
}): Promise<Spot[]> {
  try {
    let query = supabase
      .from('spots')
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

    const { data, error } = await query.limit(10); // Increase limit for potentially better recommendations

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error searching locations:', error);
    return [];
  }
}

// Define the type for the async route handler, allowing for Response return
type AsyncRequestHandler = (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | void>;

// AI Suggestion Endpoint
const aiSuggestHandler: AsyncRequestHandler = async (req, res) => {
  const { query, userId } = req.body;

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

    // 3. Search for locations based on criteria
    const locations = await searchLocations(searchCriteria);

    // 4. Generate AI response
    const aiResponseContent = await generateResponse(query, locations, userPreferences || undefined);

    // 5. Store in chat history if user is logged in
    if (userId) {
      const { error } = await supabase
        .from('chat_history')
        .insert([
          {
            user_id: userId,
            user_message: query,
            ai_response: aiResponseContent,
            locations: locations.map(l => l.id),
          }
        ]);

      if (error) {
        console.error('Error saving chat history:', error);
        // Don't block the response for history saving errors
      }
    }

    // 6. Send response back to frontend
    return res.json({ aiResponse: aiResponseContent, locations }); // Explicitly return the response

  } catch (error: any) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message || 'An unexpected error occurred' }); // Explicitly return the response
  }
};

app.post('/ai-suggest', aiSuggestHandler as RequestHandler);

app.listen(port, () => {
  console.log(`Backend server listening on port ${port}`);
}); 