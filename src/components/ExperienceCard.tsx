import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';

interface Experience {
  id: number;
  name: string;
  description: string;
  image: string;
  mood: string;
  blogSlug?: string;
}

interface ExperienceCardProps {
  experience: Experience;
}

const ExperienceCard: React.FC<ExperienceCardProps> = ({ experience }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div 
      className="flex-shrink-0 w-72 h-96 relative rounded-xl overflow-hidden group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <img 
          src={experience.image} 
          alt={experience.name} 
          className={`w-full h-full object-cover filter transition-all duration-700 ${isHovered ? 'scale-110 brightness-50' : 'brightness-75'}`}
        />
      </div>
      
      {/* Color overlay based on mood */}
      <div 
        className={`absolute inset-0 opacity-40 transition-opacity duration-500 ${isHovered ? 'opacity-70' : ''}`}
        style={{
          background: 
            experience.mood === 'Chill' ? 'linear-gradient(to top, rgba(6, 214, 160, 0.7), transparent)' :
            experience.mood === 'Wild' ? 'linear-gradient(to top, rgba(247, 37, 133, 0.7), transparent)' :
            experience.mood === 'Artsy' ? 'linear-gradient(to top, rgba(76, 201, 240, 0.7), transparent)' :
            experience.mood === 'Romantic' ? 'linear-gradient(to top, rgba(247, 37, 133, 0.7), transparent)' :
            experience.mood === 'Alone' ? 'linear-gradient(to top, rgba(76, 201, 240, 0.7), transparent)' :
            experience.mood === 'Broke' ? 'linear-gradient(to top, rgba(16, 185, 129, 0.7), transparent)' :
            experience.mood === 'Fancy' ? 'linear-gradient(to top, rgba(6, 214, 160, 0.7), transparent)' :
            'linear-gradient(to top, rgba(245, 158, 11, 0.7), transparent)'
        }}
      />
      
      {/* Content */}
      <div className="absolute inset-0 z-10 flex flex-col justify-end p-6 transition-transform duration-500">
        <div className={`transform transition-transform duration-500 ${isHovered ? 'translate-y-0' : 'translate-y-6'}`}>
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-black/40 backdrop-blur-sm border border-white/20 mb-3 inline-block">
            {experience.mood}
          </span>
          
          <h3 className="text-2xl font-bold mb-2">{experience.name}</h3>
          
          <p className={`text-white/80 mb-4 transition-opacity duration-500 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
            {experience.description}
          </p>
          
          {experience.blogSlug ? (
            <a
              href={`/blog/${experience.blogSlug}`}
              className={`
                px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20
                hover:bg-white/20 transition-all duration-300 flex items-center text-sm
                transform transition-opacity duration-500 ${isHovered ? 'opacity-100' : 'opacity-0'}
              `}
            >
              <span>View Details</span>
              <ExternalLink size={14} className="ml-2" />
            </a>
          ) : (
            <button
              className={`
                px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20
                opacity-50 cursor-not-allowed flex items-center text-sm
                transform transition-opacity duration-500 ${isHovered ? 'opacity-100' : 'opacity-0'}
              `}
              disabled
            >
              <span>View Details</span>
              <ExternalLink size={14} className="ml-2" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExperienceCard;