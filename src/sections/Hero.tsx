import React, { useState, useEffect } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Hero = () => {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const scrollToNextSection = () => {
    const moodSection = document.getElementById('mood-selector');
    if (moodSection) {
      moodSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleAiSuggest = async () => {
    setIsLoading(true);
    try {
      // Get user's current location
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });

      // Navigate to AI suggest page with location data
      navigate('/ai-suggest', {
        state: {
          location: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          }
        }
      });
    } catch (error) {
      console.error('Error getting location:', error);
      // If location access is denied or fails, still navigate to AI suggest
      navigate('/ai-suggest');
    } finally {
      setIsLoading(false);
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
          poster="https://www.pexels.com/photo/facade-of-humayuns-tomb-in-delhi-19966839/"
        >
          <source 
            src="https://ik.imagekit.io/oxsyemwolu/gettyimages-511956434-640_adpp.mp4?updatedAt=1747759154690" 
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
            <button 
              onClick={handleAiSuggest}
              disabled={isLoading}
              className="button-secondary flex items-center justify-center"
            >
              <Sparkles className="w-5 h-5 mr-2" />
              {isLoading ? 'Getting Location...' : 'Let AI Suggest'}
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