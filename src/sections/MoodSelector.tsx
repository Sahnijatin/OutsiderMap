import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MoodBubble from '../components/MoodBubble';

const moods = [
  { name: 'Chill', icon: '✌️', color: 'from-primary-500 to-accent-500' },
  { name: 'Wild', icon: '🔥', color: 'from-secondary-500 to-error-500' },
  { name: 'Artsy', icon: '🎨', color: 'from-accent-500 to-secondary-500' },
  { name: 'Romantic', icon: '❤️', color: 'from-secondary-500 to-primary-500' },
  { name: 'Alone', icon: '🧘', color: 'from-accent-500 to-primary-500' },
  { name: 'Broke', icon: '💸', color: 'from-success-500 to-warning-500' },
  { name: 'Fancy', icon: '💎', color: 'from-primary-500 to-secondary-500' },
  { name: 'Street', icon: '🛣️', color: 'from-warning-500 to-error-500' },
];

const MoodSelector: React.FC = () => {
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleMoodSelect = (mood: string) => {
    setSelectedMood(mood);
    navigate(`/vibe/${mood.toLowerCase()}`);
  };

  return (
    <section id="mood-selector" className="section-padding bg-dark-900 relative">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-radial from-primary-500/10 to-transparent opacity-30"></div>
      
      <div className="container mx-auto">
        <h2 className="text-3xl md:text-4xl font-heading font-bold text-center mb-8">
          What's your <span className="gradient-text">vibe</span> today?
        </h2>
        
        <p className="text-center text-gray-300 max-w-2xl mx-auto mb-12">
          Select your mood, and we'll reveal a Delhi you never knew existed. Each vibe unlocks unique experiences and secret spots.
        </p>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6 max-w-4xl mx-auto">
          {moods.map((mood) => (
            <MoodBubble
              key={mood.name}
              mood={mood}
              isSelected={selectedMood === mood.name}
              onSelect={() => handleMoodSelect(mood.name)}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default MoodSelector;