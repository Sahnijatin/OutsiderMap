import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader, MapPin, Clock, IndianRupee, Heart, ExternalLink, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Database } from '@/lib/database.types';
import ExampleCards from '@/components/ExampleCards';

type Spot = Database['public']['Tables']['spots']['Row'] & {
  is_favorite?: boolean;
};

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  locations?: Spot[];
  structuredResponse?: {
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
  };
}

function AiSuggest() {
  const { user, loading: authLoading } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExamples, setShowExamples] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      loadChatHistory(user.id);
    }
  }, [user]);

  const loadChatHistory = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('chat_history')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(10);

      if (error) throw error;

      if (data && data.length > 0) {
        const formattedMessages: Message[] = [];
        for (const msg of data) {
          formattedMessages.push({
            id: msg.id,
            content: msg.user_message,
            isUser: true,
            timestamp: new Date(msg.created_at),
          });

          if (msg.ai_response) {
            const locations = msg.locations ? await fetchLocations(msg.locations, userId) : [];
            formattedMessages.push({
              id: `${msg.id}-ai`,
              content: msg.ai_response,
              isUser: false,
              timestamp: new Date(msg.created_at),
              locations,
            });
          }
        }
        setMessages(formattedMessages);
      } else {
        setMessages([{
          id: '1',
          content: "Hi! I'm your AI guide for Delhi. Tell me what kind of place you're looking for, and I'll help you discover the perfect spot!",
          isUser: false,
          timestamp: new Date(),
        }]);
      }
    } catch (err) {
      console.error('Error loading chat history:', err);
      setError('Failed to load chat history');
    }
  };

  const fetchLocations = async (locationIds: string[], userId?: string): Promise<Spot[]> => {
    try {
      const { data, error } = await supabase
        .from('spots')
        .select('*')
        .in('id', locationIds);

      if (error) throw error;

      if (userId && data) {
        const { data: favorites } = await supabase
          .from('favorites')
          .select('spot_id')
          .eq('user_id', userId);

        const favoriteIds = new Set(favorites?.map(f => f.spot_id) || []);
        return data.map(spot => ({
          ...spot,
          is_favorite: favoriteIds.has(spot.id)
        }));
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching locations:', error);
      return [];
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const toggleFavorite = async (locationId: string) => {
    if (!user) return;

    try {
      const isFavorite = messages
        .flatMap(m => m.locations || [])
        .find(l => l.id === locationId)?.is_favorite;

      if (isFavorite) {
        await supabase
          .from('favorites')
          .delete()
          .match({ user_id: user.id, spot_id: locationId });
      } else {
        await supabase
          .from('favorites')
          .insert([{ user_id: user.id, spot_id: locationId }]);
      }

      setMessages(prevMessages => {
        return prevMessages.map(msg => {
          if (msg.locations && msg.locations.some(loc => loc.id === locationId)) {
            fetchLocations(msg.locations.map(loc => loc.id), user.id).then(updatedLocations => {
              setMessages(currentMessages => currentMessages.map(currentMsg => 
                currentMsg.id === msg.id ? { ...currentMsg, locations: updatedLocations } : currentMsg
              ));
            }).catch(err => console.error('Error refetching locations after favorite toggle:', err));
            return {
              ...msg,
              locations: msg.locations.map(loc =>
                loc.id === locationId
                  ? { ...loc, is_favorite: !isFavorite }
                  : loc
              )
            };
          }
          return msg;
        });
      });

    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: input,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ai-suggest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          query: input,
          userId: user?.id,
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to get recommendations from backend.');
        } else {
          throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
        }
      }

      const data = await response.json();
      const { aiResponse, locations } = data;

      const locationsWithFavorites = user ? await fetchLocations(locations.map((loc: Spot) => loc.id), user.id) : locations;

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: aiResponse.text,
        isUser: false,
        timestamp: new Date(),
        locations: locationsWithFavorites,
        structuredResponse: aiResponse
      };

      setMessages(prev => [...prev, aiMessage]);

    } catch (error: any) {
      console.error('Error fetching AI response from backend:', error);
      setError(error.message || 'Failed to get recommendations. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExampleSelect = (text: string) => {
    setInput(text);
    setShowExamples(false);
    inputRef.current?.focus();
  };

  const LocationCard = ({ location }: { location: Spot }) => (
    <div className="bg-dark-700 rounded-lg overflow-hidden">
      <div className="aspect-video relative">
        <img
          src={location.images?.[0] || '/location-placeholder.jpg'}
          alt={location.name}
          className="w-full h-full object-cover"
        />
        {user && (
          <button
            onClick={() => toggleFavorite(location.id)}
            className="absolute top-2 right-2 p-2 rounded-full bg-dark-800/80 hover:bg-dark-800 transition-colors"
          >
            <Heart
              className={`w-5 h-5 ${
                location.is_favorite ? 'text-red-500 fill-red-500' : 'text-white'
              }`}
            />
          </button>
        )}
      </div>
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-2">{location.name}</h3>
        <p className="text-gray-400 text-sm mb-3">{location.description}</p>
        <div className="space-y-2">
          <div className="flex items-center text-sm text-gray-400">
            <MapPin className="w-4 h-4 mr-2" />
            <span>{location.address}</span>
          </div>
          <div className="flex items-center text-sm text-gray-400">
            <Clock className="w-4 h-4 mr-2" />
            <span>{location.opening_hours}</span>
          </div>
          <div className="flex items-center text-sm text-gray-400">
            <IndianRupee className="w-4 h-4 mr-2" />
            <span>{location.price_range}</span>
          </div>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.address)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center text-sm text-primary-500 hover:text-primary-400 transition-colors"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            <span>Open in Google Maps</span>
          </a>
        </div>
      </div>
    </div>
  );

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <h1 className="text-4xl font-bold mb-4 gradient-text flex items-center justify-center gap-2">
          <Sparkles className="w-8 h-8" />
          AI Guide
        </h1>
        <p className="text-gray-400 text-lg">
          Your personal guide to discovering the best spots in Delhi
        </p>
      </motion.div>
      
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-error-500/20 border border-error-500 text-error-500 rounded-lg p-4 mb-6"
        >
          {error}
        </motion.div>
      )}

      {authLoading ? (
        <div className="flex justify-center items-center h-40">
          <Loader className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      ) : (
        <div className="bg-dark-800 rounded-lg overflow-hidden flex flex-col h-[600px] shadow-xl border border-dark-700">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <AnimatePresence>
              {messages.map((message, index) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.1 }}
                  className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-4 ${
                      message.isUser
                        ? 'bg-primary-500 text-white'
                        : 'bg-dark-700 text-gray-200'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    <span className="text-xs opacity-50 mt-2 block">
                      {message.timestamp.toLocaleTimeString()}
                    </span>
                    
                    {message.structuredResponse?.cards && message.structuredResponse.cards.length > 0 && (
                      <div className="mt-4 space-y-4">
                        <h4 className="font-medium">Recommended Places:</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {message.structuredResponse.cards.map((card) => (
                            <div key={card.id} className="bg-dark-800 rounded-lg overflow-hidden shadow-lg">
                              <div className="aspect-video relative">
                                <img
                                  src={card.image}
                                  alt={card.name}
                                  className="w-full h-full object-cover"
                                />
                                {user && (
                                  <button
                                    onClick={() => toggleFavorite(card.id)}
                                    className="absolute top-2 right-2 p-2 rounded-full bg-dark-800/80 hover:bg-dark-800 transition-colors"
                                  >
                                    <Heart
                                      className={`w-5 h-5 ${
                                        message.locations?.find(l => l.id === card.id)?.is_favorite 
                                          ? 'text-red-500 fill-red-500' 
                                          : 'text-white'
                                      }`}
                                    />
                                  </button>
                                )}
                              </div>
                              <div className="p-4">
                                <h3 className="text-lg font-semibold mb-2">{card.name}</h3>
                                <p className="text-gray-400 text-sm mb-3">{card.description}</p>
                                <div className="space-y-2">
                                  <div className="flex items-center text-sm text-gray-400">
                                    <MapPin className="w-4 h-4 mr-2" />
                                    <span>{card.address}</span>
                                  </div>
                                  <div className="flex items-center text-sm text-gray-400">
                                    <Clock className="w-4 h-4 mr-2" />
                                    <span>{card.opening_hours}</span>
                                  </div>
                                  <div className="flex items-center text-sm text-gray-400">
                                    <IndianRupee className="w-4 h-4 mr-2" />
                                    <span>{card.price_range}</span>
                                  </div>
                                  <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(card.address)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center text-sm text-primary-500 hover:text-primary-400 transition-colors"
                                  >
                                    <ExternalLink className="w-4 h-4 mr-2" />
                                    <span>Open in Google Maps</span>
                                  </a>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-start"
              >
                <div className="bg-dark-700 rounded-lg p-4">
                  <Loader className="w-5 h-5 animate-spin text-primary-500" />
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <AnimatePresence>
            {showExamples && messages.length <= 1 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="border-t border-dark-700"
              >
                <div className="p-4">
                  <h3 className="text-lg font-semibold mb-4 text-center text-gray-300">
                    Try asking about...
                  </h3>
                  <ExampleCards onSelect={handleExampleSelect} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} className="p-4 border-t border-dark-700">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Describe what you're looking for..."
                className="flex-1 bg-dark-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={isLoading || authLoading}
              />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                type="submit"
                disabled={isLoading || !input.trim() || authLoading}
                className="bg-primary-500 text-white rounded-lg px-4 py-2 hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={20} />
              </motion.button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default AiSuggest;