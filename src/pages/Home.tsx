import React from 'react';
import Hero from '../sections/Hero';
import MoodSelector from '../sections/MoodSelector';
import CuratedExperiences from '../sections/CuratedExperiences';
import WeekendPlan from '../sections/WeekendPlan';
import Newsletter from '../sections/Newsletter';
import Footer from '../sections/Footer';

const Home: React.FC = () => {
  return (
    <main>
      <Hero />
      <MoodSelector />
      <CuratedExperiences />
      <WeekendPlan />
      <Newsletter />
      <Footer />
    </main>
  );
};

export default Home;