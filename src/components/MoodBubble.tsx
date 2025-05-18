import React from 'react';

interface MoodProps {
  mood: {
    name: string;
    icon: string;
    color: string;
  };
  isSelected: boolean;
  onSelect: () => void;
}

const MoodBubble: React.FC<MoodProps> = ({ mood, isSelected, onSelect }) => {
  return (
    <div
      onClick={onSelect}
      className={`
        glass-card p-4 md:p-6 flex flex-col items-center justify-center aspect-square
        cursor-pointer transition-all duration-300 overflow-hidden
        ${isSelected ? 'scale-105 animate-pulse-glow neon-border' : 'hover:scale-105'}
      `}
    >
      <div className={`
        w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center mb-3
        bg-gradient-to-br ${mood.color} text-2xl sm:text-3xl
        transition-transform duration-500 ${isSelected ? 'scale-110' : ''}
      `}>
        <span>{mood.icon}</span>
      </div>
      
      <span className={`
        font-medium text-lg text-center transition-all duration-300
        ${isSelected ? 'neon-text text-white' : 'text-gray-200'}
      `}>
        {mood.name}
      </span>
    </div>
  );
};

export default MoodBubble;