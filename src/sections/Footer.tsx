import React from 'react';
import { Instagram, Twitter, Facebook, MapPin, Mail, Heart } from 'lucide-react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-black py-16 px-4 relative">
      <div className="container mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center md:items-start mb-12">
          <div className="mb-8 md:mb-0 text-center md:text-left">
            <h2 className="text-2xl font-bold gradient-text mb-2">Outsider Map</h2>
            <p className="text-gray-400 max-w-sm">
              Revealing Delhi's hidden secrets, one vibe at a time.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-8 sm:gap-16">
            <div>
              <h3 className="text-white font-medium mb-4 text-center md:text-left">Connect</h3>
              <div className="flex space-x-4 justify-center md:justify-start">
                <a href="#" className="text-gray-400 hover:text-primary-500 transition-colors">
                  <Instagram size={20} />
                </a>
                <a href="#" className="text-gray-400 hover:text-primary-500 transition-colors">
                  <Twitter size={20} />
                </a>
                <a href="#" className="text-gray-400 hover:text-primary-500 transition-colors">
                  <Facebook size={20} />
                </a>
              </div>
            </div>
            
            <div>
              <h3 className="text-white font-medium mb-4 text-center md:text-left">Contact</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-center md:justify-start text-gray-400">
                  <MapPin size={16} className="mr-2" />
                  <span>Delhi, India</span>
                </div>
                <div className="flex items-center justify-center md:justify-start text-gray-400">
                  <Mail size={16} className="mr-2" />
                  <span>hello@outsidermap.com</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center">
          <div className="text-gray-500 text-sm mb-4 md:mb-0">
            &copy; {new Date().getFullYear()} Outsider Map. All rights reserved.
          </div>
          
          <div className="flex space-x-6 text-gray-500 text-sm">
            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-white transition-colors">FAQ</a>
          </div>
        </div>
        
        <div className="mt-8 text-center text-gray-600 text-xs flex items-center justify-center">
          <span>Made with</span>
          <Heart size={12} className="mx-1 text-secondary-500" fill="#F72585" />
          <span>in Delhi</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;