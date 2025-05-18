import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ExperienceCard from '../components/ExperienceCard';

const experiences = [
  {
    id: 1,
    name: 'Champa Gali',
    description: 'Hidden art alley with bohemian cafés and studios',
    image: 'https://images.pexels.com/photos/2254030/pexels-photo-2254030.jpeg',
    mood: 'Artsy',
  },
  {
    id: 2,
    name: 'Sanjay Van',
    description: 'Urban forest with secret trails and dawn viewpoints',
    image: 'https://images.pexels.com/photos/15286/pexels-photo.jpg',
    mood: 'Chill',
  },
  {
    id: 3,
    name: 'Piano Man Jazz Club',
    description: 'Live music venue with craft cocktails and nightly jams',
    image: 'https://images.pexels.com/photos/534283/pexels-photo-534283.jpeg',
    mood: 'Wild',
  },
  {
    id: 4,
    name: 'Triveni Terrace Café',
    description: 'Cultural hub with affordable chai and art exhibitions',
    image: 'https://images.pexels.com/photos/2467287/pexels-photo-2467287.jpeg',
    mood: 'Broke',
  },
  {
    id: 5,
    name: 'Hauz Khas Fort',
    description: 'Lakeside ruins perfect for sunset picnics',
    image: 'https://images.pexels.com/photos/5187235/pexels-photo-5187235.jpeg',
    mood: 'Romantic',
  },
  {
    id: 6,
    name: 'Diggin Cafe',
    description: 'Garden restaurant with fairy lights and comfort food',
    image: 'https://images.pexels.com/photos/3887985/pexels-photo-3887985.jpeg',
    mood: 'Fancy',
  },
  {
    id: 7,
    name: 'Chandni Chowk',
    description: 'Historic market with legendary street food and hidden gems',
    image: 'https://images.pexels.com/photos/2474689/pexels-photo-2474689.jpeg',
    mood: 'Street',
  },
  {
    id: 8,
    name: 'Lodhi Art District',
    description: 'Open-air gallery with massive murals and installations',
    image: 'https://images.pexels.com/photos/1829189/pexels-photo-1829189.jpeg',
    mood: 'Alone',
  },
];

const CuratedExperiences: React.FC = () => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { current } = scrollRef;
      const scrollAmount = current.clientWidth * 0.8;
      
      if (direction === 'left') {
        current.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
      } else {
        current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      }
    }
  };

  return (
    <section className="section-padding bg-dark-800 relative">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-radial from-secondary-500/10 to-transparent opacity-30"></div>
      
      <div className="container mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl md:text-4xl font-heading font-bold">
            Curated <span className="gradient-text">Experiences</span>
          </h2>
          
          <div className="flex space-x-2">
            <button 
              onClick={() => scroll('left')}
              className="p-2 rounded-full bg-black/50 hover:bg-primary-500/20 border border-primary-500/30 transition-colors duration-300"
            >
              <ChevronLeft size={24} />
            </button>
            <button 
              onClick={() => scroll('right')}
              className="p-2 rounded-full bg-black/50 hover:bg-primary-500/20 border border-primary-500/30 transition-colors duration-300"
            >
              <ChevronRight size={24} />
            </button>
          </div>
        </div>
        
        <div 
          ref={scrollRef}
          className="flex overflow-x-auto space-x-4 pb-8 hide-scrollbar"
          style={{ scrollbarWidth: 'none' }}
        >
          {experiences.map((experience) => (
            <ExperienceCard key={experience.id} experience={experience} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default CuratedExperiences;