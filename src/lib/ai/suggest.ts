import { OrchestratorAgent } from './agents';
import { supabase } from '@/lib/supabase';
import { Database } from '@/lib/database.types';

// @ts-ignore: 'Spot' is declared but never used. (Linter might not detect indirect usage)
type Spot = Database['public']['Tables']['spots']['Row'];
type VibeType = Database['public']['Enums']['vibe_type'];
type SpotType = Database['public']['Enums']['spot_type'];
type PriceRange = Database['public']['Enums']['price_range'];

interface UserPreferences {
  preferred_vibes: VibeType[];
  preferred_types: SpotType[];
  preferred_price_ranges: PriceRange[];
}

interface StructuredResponse {
  text: string;
  cards: {
    id: string;
    name: string;
    description: string;
    image: string;
    address: string;
    price_range: PriceRange;
    vibe: VibeType;
    type: SpotType;
    opening_hours: string;
  }[];
}

export async function handleAiSuggestion(
  query: string,
  userId?: string,
  userLocation?: {
    latitude: number;
    longitude: number;
  }
): Promise<{
  aiResponse: StructuredResponse;
}> {
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

    // 2. Get conversation history if userId is provided
    let conversationHistory: { role: string; content: string }[] = [];
    if (userId) {
      const { data, error } = await supabase
        .from('chat_history')
        .select('user_message, ai_response')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;

      if (data) {
        conversationHistory = data.flatMap(msg => {
          const messages: { role: string; content: string }[] = [];
          messages.push({ role: 'user', content: msg.user_message });

          if (msg.ai_response) {
            try {
              const parsedResponse: StructuredResponse = JSON.parse(msg.ai_response);
              if (parsedResponse && typeof parsedResponse.text === 'string') {
                messages.push({ role: 'assistant', content: parsedResponse.text });
              } else {
                messages.push({ role: 'assistant', content: msg.ai_response });
              }
            } catch (parseError) {
              messages.push({ role: 'assistant', content: msg.ai_response });
            }
          }
          return messages;
        }).reverse();
      }
    }

    // 3. Process query using the agentic system
    const orchestrator = new OrchestratorAgent();
    const result = await orchestrator.processQuery(
      query,
      userPreferences || undefined,
      conversationHistory,
      userLocation
    );

    // 4. Structure the response
    const structuredResponse: StructuredResponse = {
      text: result.response,
      cards: result.locations.map(location => ({
        id: location.id,
        name: location.name,
        description: location.description,
        image: location.images?.[0] || '/location-placeholder.jpg',
        address: location.address || 'Not specified',
        price_range: location.price_range,
        vibe: location.vibe,
        type: location.type,
        opening_hours: typeof location.opening_hours === 'string' 
          ? location.opening_hours 
          : Array.isArray(location.opening_hours)
            ? location.opening_hours.join(', ')
            : 'Not specified'
      }))
    };

    // 5. Store in chat history if user is logged in
    if (userId) {
      const { error } = await supabase
        .from('chat_history')
        .insert([
          {
            user_id: userId,
            user_message: query,
            ai_response: JSON.stringify(structuredResponse),
            location_ids: result.locations.map(l => l.id),
          }
        ]);

      if (error) {
        console.error('Error saving chat history:', error);
        // Don't block the response for history saving errors
      }
    }

    // 6. Send the structured response back to frontend
    return {
      aiResponse: structuredResponse,
    };
  } catch (error) {
    console.error('Error in AI suggestion:', error);
    throw new Error('Failed to process your request. Please try again.');
  }
} 