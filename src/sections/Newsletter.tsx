import React, { useState } from 'react';
import { Send } from 'lucide-react';

const Newsletter: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      // Here you would typically call an API to submit the email
      setIsSubmitted(true);
      setEmail('');
      // Reset the submission state after 3 seconds
      setTimeout(() => setIsSubmitted(false), 3000);
    }
  };

  return (
    <section className="section-padding bg-dark-800 relative">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-radial from-secondary-500/20 via-primary-500/10 to-transparent opacity-40"></div>
      
      <div className="container mx-auto max-w-4xl relative z-10">
        <div className="glass-card p-8 md:p-12 text-center">
          <h2 className="text-3xl md:text-4xl font-heading font-bold mb-4">
            Get your weekend plan in your inbox
          </h2>
          
          <p className="text-gray-300 mb-8 max-w-2xl mx-auto">
            Every Friday, we'll send you a personalized 48-hour itinerary based on the upcoming events, weather, and your preferences. No more endless scrolling through websites.
          </p>
          
          <form onSubmit={handleSubmit} className="max-w-md mx-auto">
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                className="w-full bg-black/30 border border-white/20 rounded-full px-6 py-4 pr-36 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                required
              />
              
              <button
                type="submit"
                className={`
                  absolute right-1.5 top-1.5 px-6 py-2.5 rounded-full font-medium transition-all duration-300
                  ${isSubmitted 
                    ? 'bg-success-500 hover:bg-success-500' 
                    : 'bg-primary-500 hover:bg-primary-600'}
                  text-white
                `}
              >
                {isSubmitted ? (
                  'Subscribed!'
                ) : (
                  <>
                    <span className="hidden sm:inline">Get My Plan</span>
                    <span className="sm:hidden">Subscribe</span>
                    <Send size={16} className="ml-2 inline-block" />
                  </>
                )}
              </button>
            </div>
          </form>
          
          <p className="text-xs text-gray-400 mt-4">
            We respect your privacy. Unsubscribe anytime.
          </p>
        </div>
      </div>
    </section>
  );
};

export default Newsletter;