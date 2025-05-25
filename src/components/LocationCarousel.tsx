import React from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

interface LocationCardData {
  id: string;
  name: string;
  description: string;
  image: string;
  images?: string[];
  address: string;
  price_range: string;
  vibe: string;
  type: string;
  opening_hours: string;
  videos?: string[];
}

const LocationCarousel: React.FC<{ cards: LocationCardData[] }> = ({ cards }) => {
  if (!cards || cards.length === 0) return null;

  return (
    <div className="w-full my-4">
      <Swiper
        modules={[Navigation, Pagination]}
        navigation
        pagination={{ clickable: true }}
        spaceBetween={24}
        slidesPerView={1}
        className="rounded-lg shadow-lg bg-dark-800"
      >
        {cards.map((card) => (
          <SwiperSlide key={card.id}>
            <div className="flex flex-col md:flex-row gap-4 p-4">
              <div className="flex-1 min-w-[250px] max-w-[400px] flex flex-col items-center justify-center">
                {/* Show video if available, else show image */}
                {card.videos && card.videos.length > 0 ? (
                  <video
                    src={card.videos[0]}
                    controls
                    className="w-full h-64 object-cover rounded-lg mb-2"
                  />
                ) : card.images && card.images.length > 0 ? (
                  <img
                    src={card.images[0]}
                    alt={card.name}
                    className="w-full h-64 object-cover rounded-lg mb-2"
                  />
                ) : card.image ? (
                  <img
                    src={card.image}
                    alt={card.name}
                    className="w-full h-64 object-cover rounded-lg mb-2"
                  />
                ) : (
                  <div className="w-full h-64 bg-gray-800 flex items-center justify-center text-gray-400 rounded-lg mb-2">
                    No image available
                  </div>
                )}
              </div>
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-xl font-bold mb-2 text-primary-400">{card.name}</h3>
                  <p className="text-gray-300 mb-3">{card.description}</p>
                  <div className="space-y-1 text-sm">
                    <div className="text-gray-400"><strong>Address:</strong> {card.address}</div>
                    <div className="text-gray-400"><strong>Vibe:</strong> {card.vibe}</div>
                    <div className="text-gray-400"><strong>Type:</strong> {card.type}</div>
                    <div className="text-gray-400"><strong>Price:</strong> {card.price_range}</div>
                    <div className="text-gray-400"><strong>Opening Hours:</strong> {card.opening_hours}</div>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(card.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-500 hover:underline text-sm"
                  >
                    Open in Google Maps
                  </a>
                </div>
              </div>
            </div>
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
};

export default LocationCarousel; 