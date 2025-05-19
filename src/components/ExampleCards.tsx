import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Coffee, Moon, Utensils, Users, Clock } from 'lucide-react';

interface ExampleCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
}

const ExampleCard: React.FC<ExampleCardProps> = ({ title, description, icon, onClick }) => (
  <motion.div
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    className="bg-gradient-to-br from-dark-700 to-dark-800 rounded-xl p-6 cursor-pointer border border-dark-600 hover:border-primary-500/50 transition-all duration-300"
    onClick={onClick}
  >
    <div className="flex items-start gap-4">
      <div className="p-3 rounded-lg bg-primary-500/10 text-primary-500">
        {icon}
      </div>
      <div>
        <h3 className="text-lg font-semibold mb-2 text-white">{title}</h3>
        <p className="text-gray-400 text-sm">{description}</p>
      </div>
    </div>
  </motion.div>
);

interface ExampleCardsProps {
  onSelect: (text: string) => void;
}

const ExampleCards: React.FC<ExampleCardsProps> = ({ onSelect }) => {
  const examples = [
    {
      title: "Fancy but Budget-Friendly",
      description: "Looking for a fancy restaurant that won't break the bank",
      icon: <Utensils className="w-6 h-6" />,
      text: "I'm looking for a fancy restaurant but on a budget"
    },
    {
      title: "Late Night Adventure",
      description: "It's 4 AM and I want to have fun with friends",
      icon: <Moon className="w-6 h-6" />,
      text: "I want to go out, have fun with friends it's 4am here"
    },
    {
      title: "Coffee & Work",
      description: "Need a quiet cafe to work from",
      icon: <Coffee className="w-6 h-6" />,
      text: "Looking for a quiet cafe where I can work on my laptop"
    },
    {
      title: "Group Hangout",
      description: "Planning a meetup with 5-6 friends",
      icon: <Users className="w-6 h-6" />,
      text: "Suggest a place where 5-6 friends can hang out comfortably"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
      {examples.map((example, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
        >
          <ExampleCard
            title={example.title}
            description={example.description}
            icon={example.icon}
            onClick={() => onSelect(example.text)}
          />
        </motion.div>
      ))}
    </div>
  );
};

export default ExampleCards; 