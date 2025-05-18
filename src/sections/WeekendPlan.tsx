import React from 'react';
import WeekendPlanCard from '../components/WeekendPlanCard';

// Plan items for the weekend
const planItems = [
  {
    id: 1,
    day: 'Day 1',
    time: 'Morning',
    title: 'Breakfast at Diggin, Chanakyapuri',
    description: 'Start your day with their famous pancakes and coffee in a garden setting',
    image: 'https://images.pexels.com/photos/2403391/pexels-photo-2403391.jpeg',
  },
  {
    id: 2,
    day: 'Day 1',
    time: 'Afternoon',
    title: 'Visit Lodhi Art District',
    description: "Explore South Asia's first public art district with massive murals",
    image: 'https://images.pexels.com/photos/1266808/pexels-photo-1266808.jpeg',
  },
  {
    id: 3,
    day: 'Day 1',
    time: 'Evening',
    title: 'Dinner at Miso',
    description: 'Try authentic Korean BBQ in this hidden gem in GK-2',
    image: 'https://images.pexels.com/photos/2313686/pexels-photo-2313686.jpeg',
  },
  {
    id: 4,
    day: 'Day 1',
    time: 'Night',
    title: 'Drinks at Sidecar',
    description: 'Award-winning cocktails at one of Asia\'s top 50 bars',
    image: 'https://images.pexels.com/photos/613037/pexels-photo-613037.jpeg',
  },
  {
    id: 5,
    day: 'Day 2',
    time: 'Morning',
    title: 'Coffee at Blue Tokai',
    description: 'Specialty coffee and light breakfast at this roastery café',
    image: 'https://images.pexels.com/photos/312418/pexels-photo-312418.jpeg',
  },
  {
    id: 6,
    day: 'Day 2',
    time: 'Afternoon',
    title: 'Explore Majnu Ka Tilla',
    description: 'Delhi\'s Little Tibet with authentic Tibetan food and culture',
    image: 'https://images.pexels.com/photos/1579739/pexels-photo-1579739.jpeg',
  },
  {
    id: 7,
    day: 'Day 2',
    time: 'Evening',
    title: 'Sunset at Okhla Bird Sanctuary',
    description: 'Urban wildlife escape with views of the Yamuna and migratory birds',
    image: 'https://images.pexels.com/photos/2422915/pexels-photo-2422915.jpeg',
  },
  {
    id: 8,
    day: 'Day 2',
    time: 'Night',
    title: 'Live Music at The Piano Man',
    description: 'End your weekend with jazz and cocktails at this intimate venue',
    image: 'https://images.pexels.com/photos/995301/pexels-photo-995301.jpeg',
  },
];

const WeekendPlan: React.FC = () => {
  return (
    <section className="section-padding bg-dark-900 relative">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-radial from-accent-500/10 to-transparent opacity-30"></div>
      
      <div className="container mx-auto">
        <h2 className="text-3xl md:text-4xl font-heading font-bold text-center mb-2">
          Your curated <span className="gradient-text">48-hour plan</span>
        </h2>
        
        <p className="text-center text-gray-300 max-w-2xl mx-auto mb-12">
          A perfect weekend in Delhi based on your vibe. Each moment carefully selected for maximum experience.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          <div className="space-y-6">
            <h3 className="text-2xl font-bold gradient-text mb-4">Day 1</h3>
            
            {planItems
              .filter(item => item.day === 'Day 1')
              .map(item => (
                <WeekendPlanCard key={item.id} planItem={item} />
              ))
            }
          </div>
          
          <div className="space-y-6">
            <h3 className="text-2xl font-bold gradient-text mb-4">Day 2</h3>
            
            {planItems
              .filter(item => item.day === 'Day 2')
              .map(item => (
                <WeekendPlanCard key={item.id} planItem={item} />
              ))
            }
          </div>
        </div>
      </div>
    </section>
  );
};

export default WeekendPlan;