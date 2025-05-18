import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Filter, MapPin, Clock, IndianRupee } from 'lucide-react';
import ExperienceCard from '../components/ExperienceCard';

interface FilterState {
  timeOfDay: string[];
  price: string[];
  type: string[];
  distance: string;
}

const VibePage: React.FC = () => {
  const { vibeName } = useParams<{ vibeName: string }>();
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    timeOfDay: [],
    price: [],
    type: [],
    distance: '10km',
  });

  // Mock data - replace with API call
  const experiences = [
    {
      id: 1,
      name: "Champa Gali",
      description: "Hidden art alley with bohemian cafés and studios",
      image: "https://images.pexels.com/photos/2254030/pexels-photo-2254030.jpeg",
      mood: vibeName || "Artsy",
    },
    // Add more experiences...
  ];

  return (
    <main className="pt-20">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold gradient-text">
            {vibeName} <span className="text-white">Vibes</span>
          </h1>
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center space-x-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <Filter size={20} />
            <span>Filters</span>
          </button>
        </div>

        {showFilters && (
          <div className="glass-card p-6 mb-8 grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Time of Day Filter */}
            <div>
              <label className="flex items-center space-x-2 mb-3">
                <Clock size={16} />
                <span>Time of Day</span>
              </label>
              <div className="space-y-2">
                {['Morning', 'Evening', 'Night'].map((time) => (
                  <label key={time} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={filters.timeOfDay.includes(time)}
                      onChange={(e) => {
                        const newTimeOfDay = e.target.checked
                          ? [...filters.timeOfDay, time]
                          : filters.timeOfDay.filter((t) => t !== time);
                        setFilters({ ...filters, timeOfDay: newTimeOfDay });
                      }}
                      className="form-checkbox text-primary-500"
                    />
                    <span>{time}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Price Filter */}
            <div>
              <label className="flex items-center space-x-2 mb-3">
                <IndianRupee size={16} />
                <span>Price Range</span>
              </label>
              <div className="space-y-2">
                {['Free', 'Budget', 'Premium'].map((price) => (
                  <label key={price} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={filters.price.includes(price)}
                      onChange={(e) => {
                        const newPrice = e.target.checked
                          ? [...filters.price, price]
                          : filters.price.filter((p) => p !== price);
                        setFilters({ ...filters, price: newPrice });
                      }}
                      className="form-checkbox text-primary-500"
                    />
                    <span>{price}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Type Filter */}
            <div>
              <label className="flex items-center space-x-2 mb-3">
                <MapPin size={16} />
                <span>Type</span>
              </label>
              <div className="space-y-2">
                {['Event', 'Café', 'Nature', 'Hidden Gem', 'Bar', 'Activity'].map((type) => (
                  <label key={type} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={filters.type.includes(type)}
                      onChange={(e) => {
                        const newType = e.target.checked
                          ? [...filters.type, type]
                          : filters.type.filter((t) => t !== type);
                        setFilters({ ...filters, type: newType });
                      }}
                      className="form-checkbox text-primary-500"
                    />
                    <span>{type}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Distance Filter */}
            <div>
              <label className="flex items-center space-x-2 mb-3">
                <MapPin size={16} />
                <span>Distance</span>
              </label>
              <select
                value={filters.distance}
                onChange={(e) => setFilters({ ...filters, distance: e.target.value })}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white"
              >
                <option value="5km">Within 5km</option>
                <option value="10km">Within 10km</option>
                <option value="15km">Within 15km</option>
                <option value="20km">Within 20km</option>
              </select>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {experiences.map((experience) => (
            <ExperienceCard key={experience.id} experience={experience} />
          ))}
        </div>
      </div>
    </main>
  );
};

export default VibePage;