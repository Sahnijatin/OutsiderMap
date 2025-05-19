-- Create enum types
CREATE TYPE spot_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE price_range AS ENUM ('budget', 'moderate', 'expensive');
CREATE TYPE spot_type AS ENUM ('cafe', 'restaurant', 'bar', 'park', 'museum', 'other');
CREATE TYPE vibe_type AS ENUM ('chill', 'artsy', 'wild', 'romantic', 'foodie');

-- Create spots table
CREATE TABLE spots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    address TEXT NOT NULL,
    vibe vibe_type NOT NULL,
    type spot_type NOT NULL,
    price_range price_range NOT NULL,
    opening_hours TEXT,
    contact_info TEXT,
    images TEXT[] DEFAULT '{}',
    status spot_status DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create chat_history table
CREATE TABLE chat_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    user_message TEXT NOT NULL,
    ai_response TEXT,
    locations UUID[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create user_preferences table
CREATE TABLE user_preferences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) UNIQUE,
    preferred_vibes vibe_type[] DEFAULT '{}',
    preferred_types spot_type[] DEFAULT '{}',
    preferred_price_ranges price_range[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create favorites table
CREATE TABLE favorites (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    spot_id UUID REFERENCES spots(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(user_id, spot_id)
);

-- Create RLS policies
ALTER TABLE spots ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

-- Spots policies
CREATE POLICY "Public spots are viewable by everyone"
    ON spots FOR SELECT
    USING (status = 'approved');

CREATE POLICY "Users can insert spots"
    ON spots FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own spots"
    ON spots FOR UPDATE
    USING (auth.uid() = user_id);

-- Chat history policies
CREATE POLICY "Users can view their own chat history"
    ON chat_history FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chat history"
    ON chat_history FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- User preferences policies
CREATE POLICY "Users can view their own preferences"
    ON user_preferences FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
    ON user_preferences FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
    ON user_preferences FOR UPDATE
    USING (auth.uid() = user_id);

-- Favorites policies
CREATE POLICY "Users can view their own favorites"
    ON favorites FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own favorites"
    ON favorites FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own favorites"
    ON favorites FOR DELETE
    USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX spots_vibe_idx ON spots(vibe);
CREATE INDEX spots_type_idx ON spots(type);
CREATE INDEX spots_price_range_idx ON spots(price_range);
CREATE INDEX spots_status_idx ON spots(status);
CREATE INDEX spots_user_id_idx ON spots(user_id);
CREATE INDEX chat_history_user_id_idx ON chat_history(user_id);
CREATE INDEX favorites_user_id_idx ON favorites(user_id);
CREATE INDEX favorites_spot_id_idx ON favorites(spot_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_spots_updated_at
    BEFORE UPDATE ON spots
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 