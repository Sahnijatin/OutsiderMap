import React, { useState } from 'react';
import { Clock, MapPin } from 'lucide-react';

interface PlanItem {
  id: number;
  day: string;
  time: string;
  title: string;
  description: string;
  image: string;
}

interface WeekendPlanCardProps {
  planItem: PlanItem;
}

const WeekendPlanCard: React.FC<WeekendPlanCardProps> = ({ planItem }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div 
      className={`
        glass-card overflow-hidden cursor-pointer transition-all duration-500
        ${isExpanded ? 'h-64' : 'h-24'}
      `}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="flex h-24 items-center p-4">
        <div 
          className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border border-white/10"
          style={{
            backgroundImage: `url(${planItem.image})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        ></div>
        
        <div className="ml-4 flex-grow">
          <div className="flex items-center text-xs text-primary-400 mb-1">
            <Clock size={12} className="mr-1" />
            <span>{planItem.time}</span>
          </div>
          
          <h4 className="font-medium text-white">{planItem.title}</h4>
        </div>
      </div>
      
      {/* Expanded content */}
      <div className={`
        p-4 pt-0 transition-opacity duration-300
        ${isExpanded ? 'opacity-100' : 'opacity-0'}
      `}>
        <div className="h-px bg-white/10 w-full mb-4"></div>
        
        <p className="text-gray-300 text-sm mb-4">{planItem.description}</p>
        
        <div className="flex justify-between">
          <div className="flex items-center text-xs text-accent-400">
            <MapPin size={12} className="mr-1" />
            <span>View on map</span>
          </div>
          
          <button className="text-xs px-3 py-1 rounded-full bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 transition-colors">
            Add to Plan
          </button>
        </div>
      </div>
    </div>
  );
};

export default WeekendPlanCard;