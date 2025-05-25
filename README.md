# 🗺️ Outsider Map - Delhi's Hidden Gems Discovery Platform

> **A cinematic, AI-powered platform helping users discover unique, vibe-based experiences in Delhi**

[![Netlify Status](https://api.netlify.com/api/v1/badges/your-badge-id/deploy-status)](https://app.netlify.com/sites/your-site/deploys)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🌟 Overview

Outsider Map is more than a directory — it's a dynamic, immersive digital city guide powered by both curation and AI. Users can discover hidden spots in Delhi based on their mood, get AI-powered recommendations, and explore curated weekend plans.

### ✨ Key Features

- **🤖 AI-Powered Recommendations**: Multi-agent AI system for personalized suggestions
- **🎭 Vibe-Based Discovery**: Find places based on mood (Chill, Artsy, Wild, Romantic, Foodie)
- **📱 Mobile-First Design**: Responsive, cinematic UI with smooth animations
- **🗓️ Weekend Plans**: Curated 48-hour experiences updated weekly
- **📝 User Submissions**: Community-driven content with admin moderation
- **⭐ Reviews & Ratings**: User feedback system with image uploads
- **📧 Newsletter**: Weekly curated content delivery

## 🏗️ Architecture

### Frontend
- **React 18** + **TypeScript** + **Vite**
- **Tailwind CSS** + **Framer Motion** for animations
- **React Router** for navigation
- **Supabase** for authentication and real-time data

### Backend
- **Supabase** (PostgreSQL) with Row Level Security
- **Express.js** API with security middleware
- **OpenAI GPT-4** for AI recommendations
- **Multi-agent AI system** for intelligent query processing

### Database Schema
- **places**: Unified location data with geospatial support
- **vibes**: Mood categories with visual styling
- **weekend_plans**: Curated experiences
- **blog_posts**: Content management
- **reviews**: User feedback system
- **analytics_events**: Usage tracking

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Supabase account
- OpenAI API key

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/outsider-map.git
cd outsider-map
```

2. **Install dependencies**
```bash
# Frontend
npm install

# Backend API
cd api
npm install
cd ..
```

3. **Environment Setup**
```bash
# Copy environment template
cp env.example .env

# Fill in your actual values in .env:
# - VITE_SUPABASE_URL
# - VITE_SUPABASE_ANON_KEY  
# - VITE_OPENAI_API_KEY
```

4. **Database Setup**
```bash
# Install Supabase CLI
npm install -g supabase

# Initialize Supabase (if not already done)
supabase init

# Run migrations
supabase db push

# Seed initial data (optional)
supabase db seed
```

5. **Start Development Servers**
```bash
# Terminal 1: Frontend
npm run dev

# Terminal 2: Backend API
cd api
npm run dev
```

Visit `http://localhost:5173` to see the application.

## 📊 Database Schema

### Core Tables

#### places
```sql
- id (UUID, Primary Key)
- name, description, address
- latitude, longitude, area
- vibe (enum), type (enum), price_range (enum)
- opening_hours (JSONB), contact_info (JSONB)
- images[], amenities[]
- rating, review_count
- status, featured, user_id
```

#### vibes
```sql
- id (UUID), name (unique)
- display_name, description
- icon, color
```

#### weekend_plans
```sql
- id (UUID), title, description, theme
- day1_places[], day2_places[]
- day1_description, day2_description
- estimated_budget, is_active
```

### Supporting Tables
- **blog_posts**: Content management with markdown support
- **reviews**: User ratings and comments
- **submissions**: User-submitted places for admin review
- **newsletter_subscribers**: Email list management
- **analytics_events**: Usage tracking and insights

## 🤖 AI System

### Multi-Agent Architecture

1. **Context Understanding Agent**: Analyzes user queries and conversation history
2. **Validation Agent**: Ensures search criteria are valid and safe
3. **Location Expert Agent**: Finds relevant places from database
4. **User Preference Agent**: Personalizes responses based on user history
5. **Orchestrator Agent**: Coordinates all agents for optimal results

### AI Features
- **Natural Language Processing**: Understands complex user queries
- **Conversation Memory**: Maintains context across chat sessions
- **Personalization**: Learns from user preferences and history
- **Fallback Responses**: Graceful handling of edge cases

## 🔒 Security Features

### Backend Security
- **Rate Limiting**: AI endpoints limited to 20 requests/15min
- **Input Validation**: Comprehensive validation using express-validator
- **CORS Protection**: Configured for specific origins
- **Security Headers**: Helmet.js for security headers
- **SQL Injection Protection**: Parameterized queries via Supabase

### Database Security
- **Row Level Security (RLS)**: Granular access control
- **User Authentication**: Supabase Auth integration
- **Data Encryption**: At-rest and in-transit encryption
- **Audit Logging**: Analytics events for tracking

## 📱 Performance Optimizations

### Frontend
- **Code Splitting**: Lazy loading for routes
- **Image Optimization**: WebP format with fallbacks
- **Caching Strategy**: Service worker for offline support
- **Bundle Analysis**: Webpack bundle analyzer integration

### Backend
- **Database Indexing**: Optimized queries with proper indexes
- **Connection Pooling**: Supabase handles connection management
- **Response Caching**: Redis integration for frequently accessed data
- **CDN Integration**: Static asset delivery optimization

## 🚀 Deployment

### Frontend (Netlify)
```bash
# Build for production
npm run build

# Deploy to Netlify
netlify deploy --prod --dir=dist
```

### Backend (Railway/Heroku)
```bash
cd api
npm run build
# Deploy using your preferred platform
```

### Environment Variables for Production
```bash
# Required for production
VITE_SUPABASE_URL=your_production_supabase_url
VITE_SUPABASE_ANON_KEY=your_production_anon_key
VITE_OPENAI_API_KEY=your_openai_key
NODE_ENV=production
```

## 📈 Analytics & Monitoring

### Built-in Analytics
- **User Behavior Tracking**: Page views, AI queries, favorites
- **Performance Monitoring**: API response times, error rates
- **Content Analytics**: Popular places, search patterns

### Integration Options
- **Google Analytics**: Web analytics
- **Mixpanel**: Event tracking
- **Sentry**: Error monitoring
- **Supabase Analytics**: Database insights

## 🛠️ Development

### Code Structure
```
src/
├── components/     # Reusable UI components
├── pages/         # Route components
├── sections/      # Homepage sections
├── lib/           # Utilities and configurations
│   ├── ai/        # AI system implementation
│   └── supabase.ts # Database client
├── styles/        # Global styles
└── types/         # TypeScript definitions
```

### Development Guidelines
- **TypeScript**: Strict mode enabled
- **ESLint**: Code quality enforcement
- **Prettier**: Code formatting
- **Husky**: Pre-commit hooks
- **Conventional Commits**: Commit message standards

## 🔄 API Endpoints

### Public Endpoints
- `GET /api/places` - Get approved places
- `GET /api/vibes` - Get all vibes
- `GET /api/weekend-plans` - Get active weekend plans
- `POST /api/ai/suggest` - AI recommendations

### Authenticated Endpoints
- `POST /api/places` - Submit new place
- `POST /api/reviews` - Add review
- `GET /api/user/favorites` - Get user favorites
- `POST /api/newsletter/subscribe` - Newsletter signup

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup for Contributors
```bash
# Install dependencies
npm install

# Set up pre-commit hooks
npm run prepare

# Run tests
npm test

# Check code quality
npm run lint
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **OpenAI** for GPT-4 API
- **Supabase** for backend infrastructure
- **Netlify** for hosting
- **Delhi Community** for inspiration and feedback

## 📞 Support

- **Email**: support@outsidermap.com
- **Discord**: [Join our community](https://discord.gg/outsidermap)
- **Issues**: [GitHub Issues](https://github.com/yourusername/outsider-map/issues)

---

**Built with ❤️ for Delhi's explorers** 