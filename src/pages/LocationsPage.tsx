import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Filter, Search, Loader } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import ExperienceCard from '../components/ExperienceCard';

interface BlogPostPreview {
  slug: string;
  title: string;
  images: string[];
  videos: string[];
  reels: string[];
}

interface Location {
  id: string;
  name: string;
  description: string;
  type: string;
  price_range: string;
  rating: number;
  images: string[];
  vibes: string[];
  blog_post: BlogPostPreview | null;
}

const LocationsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');

  const [filters, setFilters] = useState({
    type: searchParams.getAll('type'),
    vibes: searchParams.getAll('vibes'),
    priceRange: searchParams.getAll('price'),
    rating: searchParams.get('rating') || '',
    amenities: searchParams.getAll('amenities'),
  });

  useEffect(() => {
    fetchData();
  }, [searchParams]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch locations
      let locQuery = supabase.from('locations').select('*');
      if (searchQuery) {
        locQuery = locQuery.or(`name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
      }
      if (filters.type.length > 0) {
        locQuery = locQuery.in('type', filters.type);
      }
      if (filters.priceRange.length > 0) {
        locQuery = locQuery.in('price_range', filters.priceRange);
      }
      if (filters.rating) {
        locQuery = locQuery.gte('rating', parseFloat(filters.rating));
      }
      const { data: locData, error: locError } = await locQuery;
      if (locError) throw locError;

      // Fetch blog posts
      const { data: blogData, error: blogError } = await supabase
        .from('blog_posts')
        .select('id, slug, title, images, videos, reels');
      if (blogError) throw blogError;

      // Fetch location_vibes for each location
      const { data: vibesData, error: vibesError } = await supabase
        .from('location_vibes')
        .select('location_id, vibes (name)');
      if (vibesError) throw vibesError;

      // Map vibes to locations
      const locsWithVibes = (locData || []).map(loc => ({
        ...loc,
        vibes: (vibesData || [])
          .filter(v => v.location_id === loc.id)
          .map(v => v.vibes?.name),
      }));

      // Attach blog post preview to each location
      setLocations(
        locsWithVibes.map(loc => ({
          ...loc,
          blog_post: blogData?.find(bp => bp.id === loc.blog_post_id) || null,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const updateFilters = (newFilters: typeof filters) => {
    setFilters(newFilters);
    
    // Update URL params
    const params = new URLSearchParams();
    if (searchQuery) params.set('q', searchQuery);
    newFilters.type.forEach(type => params.append('type', type));
    newFilters.vibes.forEach(vibe => params.append('vibes', vibe));
    newFilters.priceRange.forEach(price => params.append('price', price));
    if (newFilters.rating) params.set('rating', newFilters.rating);
    newFilters.amenities.forEach(amenity => params.append('amenities', amenity));
    
    setSearchParams(params);
  };

  const clearFilters = () => {
    setFilters({
      type: [],
      vibes: [],
      priceRange: [],
      rating: '',
      amenities: [],
    });
    setSearchQuery('');
    setSearchParams({});
  };

  return (
    <main className="pt-20">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-8">
          <h1 className="text-4xl font-bold gradient-text">
            Discover <span className="text-white">Places</span>
          </h1>

          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search locations..."
                className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/50"
              />
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            >
              <Filter size={20} />
              <span className="hidden md:inline">Filters</span>
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="glass-card p-6 mb-8"
            >
              {/* Filter controls */}
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {/* Type Filter */}
                <div>
                  <h3 className="font-medium mb-3">Type</h3>
                  <div className="space-y-2">
                    {['Restaurant', 'Cafe', 'Park', 'Bar', 'Museum'].map(type => (
                      <label key={type} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={filters.type.includes(type)}
                          onChange={(e) => {
                            const newTypes = e.target.checked
                              ? [...filters.type, type]
                              : filters.type.filter(t => t !== type);
                            updateFilters({ ...filters, type: newTypes });
                          }}
                          className="form-checkbox text-primary-500"
                        />
                        <span>{type}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Price Range Filter */}
                <div>
                  <h3 className="font-medium mb-3">Price Range</h3>
                  <div className="space-y-2">
                    {['Budget', 'Moderate', 'Expensive'].map(price => (
                      <label key={price} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={filters.priceRange.includes(price)}
                          onChange={(e) => {
                            const newPrices = e.target.checked
                              ? [...filters.priceRange, price]
                              : filters.priceRange.filter(p => p !== price);
                            updateFilters({ ...filters, priceRange: newPrices });
                          }}
                          className="form-checkbox text-primary-500"
                        />
                        <span>{price}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Rating Filter */}
                <div>
                  <h3 className="font-medium mb-3">Minimum Rating</h3>
                  <select
                    value={filters.rating}
                    onChange={(e) => updateFilters({ ...filters, rating: e.target.value })}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2"
                  >
                    <option value="">Any Rating</option>
                    <option value="4">4+ Stars</option>
                    <option value="4.5">4.5+ Stars</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end mt-6">
                <button
                  onClick={clearFilters}
                  className="px-4 py-2 text-sm text-white/80 hover:text-white transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <div className="glass-card p-4 mb-8 text-error-500">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {locations.map((location) => (
              <ExperienceCard
                key={location.id}
                experience={{
                  id: parseInt(location.id),
                  name: location.name,
                  description: location.description,
                  image:
                    (location.blog_post && Array.isArray(location.blog_post.images) && location.blog_post.images.length > 0)
                      ? location.blog_post.images[0]
                      : (Array.isArray(location.images) && location.images.length > 0
                        ? location.images[0]
                        : '/fallback-image.jpg'),
                  mood: location.vibes[0] || 'Unknown',
                  blogSlug: location.blog_post?.slug || '',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
};

export default LocationsPage;