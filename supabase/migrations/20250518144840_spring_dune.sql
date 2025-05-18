/*
  # Location Discovery Platform Schema

  1. New Tables
    - locations
      - id (uuid, primary key)
      - name (text)
      - description (text)
      - address (text)
      - latitude (float8)
      - longitude (float8)
      - type (text)
      - price_range (text)
      - rating (float4)
      - operating_hours (jsonb)
      - amenities (text[])
      - images (text[])
      - created_at (timestamptz)
      - updated_at (timestamptz)
      - blog_post_id (uuid, references blog_posts)
    
    - vibes
      - id (uuid, primary key)
      - name (text)
      - icon (text)
      - color (text)
      - created_at (timestamptz)
    
    - location_vibes
      - location_id (uuid, references locations)
      - vibe_id (uuid, references vibes)
      - PRIMARY KEY (location_id, vibe_id)

  2. Security
    - Enable RLS on all tables
    - Add policies for public read access
    - Add policies for authenticated users to submit locations
*/

-- Create locations table
CREATE TABLE locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  address text NOT NULL,
  latitude float8 NOT NULL,
  longitude float8 NOT NULL,
  type text NOT NULL,
  price_range text NOT NULL,
  rating float4,
  operating_hours jsonb,
  amenities text[],
  images text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  blog_post_id uuid REFERENCES blog_posts(id)
);

-- Create vibes table
CREATE TABLE vibes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  icon text NOT NULL,
  color text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create location_vibes junction table
CREATE TABLE location_vibes (
  location_id uuid REFERENCES locations ON DELETE CASCADE,
  vibe_id uuid REFERENCES vibes ON DELETE CASCADE,
  PRIMARY KEY (location_id, vibe_id)
);

-- Enable RLS
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE vibes ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_vibes ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow public read access on locations"
  ON locations
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public read access on vibes"
  ON vibes
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public read access on location_vibes"
  ON location_vibes
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow authenticated users to insert locations"
  ON locations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create indexes
CREATE INDEX locations_type_idx ON locations (type);
CREATE INDEX locations_price_range_idx ON locations (price_range);
CREATE INDEX locations_rating_idx ON locations (rating);
CREATE INDEX vibes_name_idx ON vibes (name);

-- Create blog_posts table
CREATE TABLE blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  content text, -- Markdown or HTML
  images text[], -- Array of image URLs
  videos text[], -- Array of video URLs (YouTube, Vimeo, etc.)
  reels text[],  -- Array of Instagram reel URLs or similar
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);