import React, { useState, useEffect } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';

const Hero = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const scrollToNextSection = () => {
    const moodSection = document.getElementById('mood-selector');
    if (moodSection) {
      moodSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="relative h-screen w-full overflow-hidden">
      {/* Video Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-black/50 z-10"></div>
        <video
          className="w-full h-full object-cover"
          autoPlay
          loop
          muted
          playsInline
          poster="https://images.pexels.com/photos/1720315/pexels-photo-1720315.jpeg"
        >
          <source 
            src="https://media.istockphoto.com/id/1420758814/video/india-gate-delhi-time-lapse-video.mp4?s=mp4-640x640-is&k=20&c=vg2b-nk9JxgzFhhVDVwuxJIEEQh7O5-qTwYnRn9zDyc=" 
            type="video/mp4" 
          />
          Your browser does not support the video tag.
        </video>
      </div>

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-4 text-center">
        <div className={`transition-all duration-1000 ${isVisible ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform -translate-y-12'}`}>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-4 gradient-text">
            You're bored again. Delhi isn't.
          </h1>
          <h2 className="text-xl md:text-2xl text-gray-200 mb-8 max-w-2xl mx-auto">
            Tell us your vibe. We'll show you where to go.
          </h2>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button 
              onClick={scrollToNextSection}
              className="button-primary"
            >
              Explore Now
            </button>
            <button className="button-secondary flex items-center justify-center">
              <Sparkles className="w-5 h-5 mr-2" />
              Let AI Suggest
            </button>
          </div>
        </div>
        
        {/* Scroll indicator */}
        <div 
          className="absolute bottom-8 animate-bounce cursor-pointer" 
          onClick={scrollToNextSection}
        >
          <ChevronDown size={32} className="text-white/80" />
        </div>
      </div>
    </section>
  );
};

export default Hero;