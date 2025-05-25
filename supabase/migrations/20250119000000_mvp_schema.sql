-- MVP Schema Migration for Outsider Map
-- Consolidates existing tables and adds missing functionality

-- Drop existing inconsistent tables if they exist
DROP TABLE IF EXISTS location_vibes CASCADE;
DROP TABLE IF EXISTS locations CASCADE;

-- Create unified places table (consolidating spots and locations)
CREATE TABLE places (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    address TEXT NOT NULL,
    latitude FLOAT8,
    longitude FLOAT8,
    area TEXT, -- Delhi area (e.g., "Connaught Place", "Hauz Khas")
    vibe vibe_type NOT NULL,
    type spot_type NOT NULL,
    price_range price_range NOT NULL,
    opening_hours JSONB, -- Structured hours data
    contact_info JSONB, -- Phone, email, website
    images TEXT[] DEFAULT '{}',
    amenities TEXT[] DEFAULT '{}', -- WiFi, Parking, Pet-friendly, etc.
    rating FLOAT4 DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    status spot_status DEFAULT 'pending',
    featured BOOLEAN DEFAULT false,
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create vibes reference table
CREATE TABLE vibes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create weekend plans table
CREATE TABLE weekend_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    theme TEXT, -- "Romantic", "Adventure", "Foodie", etc.
    day1_places UUID[] DEFAULT '{}', -- Array of place IDs
    day2_places UUID[] DEFAULT '{}',
    day1_description TEXT,
    day2_description TEXT,
    estimated_budget INTEGER, -- In INR
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW') NOT NULL
);

-- Create blog posts table
CREATE TABLE blog_posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    excerpt TEXT,
    content TEXT NOT NULL, -- Markdown content
    featured_image TEXT,
    images TEXT[] DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    related_places UUID[] DEFAULT '{}', -- Array of place IDs
    author_id UUID REFERENCES auth.users(id),
    published BOOLEAN DEFAULT false,
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW') NOT NULL
);

-- Create newsletter subscribers table
CREATE TABLE newsletter_subscribers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    preferences JSONB DEFAULT '{}', -- Vibe preferences, frequency, etc.
    subscribed BOOLEAN DEFAULT true,
    verified BOOLEAN DEFAULT false,
    verification_token TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create user submissions table
CREATE TABLE submissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    address TEXT NOT NULL,
    suggested_vibe vibe_type,
    suggested_type spot_type,
    suggested_price_range price_range,
    contact_info TEXT,
    images TEXT[] DEFAULT '{}',
    admin_notes TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'needs_review')),
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create user reviews table
CREATE TABLE reviews (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    place_id UUID REFERENCES places(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    images TEXT[] DEFAULT '{}',
    helpful_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create analytics table for tracking
CREATE TABLE analytics_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type TEXT NOT NULL, -- 'place_view', 'ai_query', 'favorite_add', etc.
    user_id UUID REFERENCES auth.users(id),
    place_id UUID REFERENCES places(id),
    metadata JSONB DEFAULT '{}',
    session_id TEXT,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Insert default vibes
INSERT INTO vibes (name, display_name, description, icon, color) VALUES
('chill', 'Chill', 'Relaxed and laid-back vibes', '🌿', '#10B981'),
('artsy', 'Artsy', 'Creative and cultural experiences', '🎨', '#8B5CF6'),
('wild', 'Wild', 'High-energy and exciting', '🔥', '#EF4444'),
('romantic', 'Romantic', 'Perfect for dates and intimate moments', '💕', '#EC4899'),
('foodie', 'Foodie', 'Amazing food and culinary experiences', '🍽️', '#F59E0B');

-- Enable RLS on all tables
ALTER TABLE places ENABLE ROW LEVEL SECURITY;
ALTER TABLE vibes ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekend_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Places policies
CREATE POLICY "Public can view approved places" ON places
    FOR SELECT USING (status = 'approved');

CREATE POLICY "Users can insert places" ON places
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own places" ON places
    FOR UPDATE USING (auth.uid() = user_id);

-- Vibes policies (public read)
CREATE POLICY "Public can view vibes" ON vibes
    FOR SELECT TO public USING (true);

-- Weekend plans policies
CREATE POLICY "Public can view active weekend plans" ON weekend_plans
    FOR SELECT USING (is_active = true);

-- Blog posts policies
CREATE POLICY "Public can view published blog posts" ON blog_posts
    FOR SELECT USING (published = true);

-- Newsletter policies
CREATE POLICY "Users can manage their own subscription" ON newsletter_subscribers
    FOR ALL USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Submissions policies
CREATE POLICY "Users can view their own submissions" ON submissions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert submissions" ON submissions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Reviews policies
CREATE POLICY "Public can view reviews" ON reviews
    FOR SELECT TO public USING (true);

CREATE POLICY "Users can insert reviews" ON reviews
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Analytics policies (admin only)
CREATE POLICY "Only authenticated users can insert analytics" ON analytics_events
    FOR INSERT TO authenticated WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX places_vibe_idx ON places(vibe);
CREATE INDEX places_type_idx ON places(type);
CREATE INDEX places_price_range_idx ON places(price_range);
CREATE INDEX places_status_idx ON places(status);
CREATE INDEX places_area_idx ON places(area);
CREATE INDEX places_rating_idx ON places(rating);
CREATE INDEX places_location_idx ON places USING GIST(ll_to_earth(latitude, longitude));

CREATE INDEX blog_posts_slug_idx ON blog_posts(slug);
CREATE INDEX blog_posts_published_idx ON blog_posts(published, published_at);
CREATE INDEX blog_posts_tags_idx ON blog_posts USING GIN(tags);

CREATE INDEX reviews_place_id_idx ON reviews(place_id);
CREATE INDEX reviews_user_id_idx ON reviews(user_id);

CREATE INDEX analytics_events_type_idx ON analytics_events(event_type);
CREATE INDEX analytics_events_created_at_idx ON analytics_events(created_at);

-- Create functions for triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers
CREATE TRIGGER update_places_updated_at
    BEFORE UPDATE ON places
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_weekend_plans_updated_at
    BEFORE UPDATE ON weekend_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_blog_posts_updated_at
    BEFORE UPDATE ON blog_posts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to update place ratings
CREATE OR REPLACE FUNCTION update_place_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE places 
    SET 
        rating = (SELECT AVG(rating) FROM reviews WHERE place_id = NEW.place_id),
        review_count = (SELECT COUNT(*) FROM reviews WHERE place_id = NEW.place_id)
    WHERE id = NEW.place_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_place_rating_trigger
    AFTER INSERT OR UPDATE OR DELETE ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_place_rating();

-- Migrate existing data from spots table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'spots') THEN
        INSERT INTO places (
            id, name, description, address, vibe, type, price_range,
            opening_hours, contact_info, images, status, user_id, created_at, updated_at
        )
        SELECT 
            id, name, description, address, vibe, type, price_range,
            CASE 
                WHEN opening_hours IS NOT NULL THEN json_build_object('general', opening_hours)
                ELSE NULL
            END,
            CASE 
                WHEN contact_info IS NOT NULL THEN json_build_object('general', contact_info)
                ELSE NULL
            END,
            images, status, user_id, created_at, updated_at
        FROM spots;
        
        -- Drop the old spots table
        DROP TABLE spots CASCADE;
    END IF;
END $$; 