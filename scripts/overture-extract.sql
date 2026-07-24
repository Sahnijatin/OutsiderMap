-- Extract candidate places for one metro from Overture Maps.
--
-- Run with the DuckDB CLI (no repo dependency - this is a one-off data pull,
-- not part of the app):
--
--   duckdb -c ".read scripts/overture-extract.sql"
--
-- Produces scripts/out/overture-candidates.json, which scripts/import-places.mjs
-- then classifies, dedupes and loads. Two steps on purpose: you get to look at
-- what came back before any of it touches the catalog.
--
-- Licensing: the Overture *places* theme is permissive and carries NO
-- share-alike obligation - CDLA-Permissive 2.0 (Meta, Microsoft, PinMeTo,
-- Krick, RenderSEO, DAC, BrightQuery), Apache 2.0 (Foursquare), CC0
-- (AllThePlaces). This is unlike Overture's buildings/transportation/base
-- themes, which are ODbL and would drag copyleft into our database, so do not
-- casually widen this query to those themes.
--
-- Attribution obligations are real and are discharged on /attribution.
-- Foursquare's Apache-2.0 share requires its NOTICE text specifically.

INSTALL httpfs; LOAD httpfs;

-- Bump when Overture cuts a new release (releases are listed under
-- s3://overturemaps-us-west-2/release/).
SET VARIABLE overture_release = '2026-07-22.0';

-- Delhi NCR. Change these four numbers to pull a different metro.
SET VARIABLE bbox_west  = 76.8;
SET VARIABLE bbox_east  = 77.6;
SET VARIABLE bbox_south = 28.2;
SET VARIABLE bbox_north = 28.9;

-- Confidence is Overture's own score for "this is a real, correctly-described
-- place". Below ~0.75 the tail is mostly duplicates, closed venues and noise;
-- we would spend more human time rejecting than the rows are worth.
SET VARIABLE min_confidence = 0.75;

COPY (
  SELECT
    id                        AS overture_id,
    names.primary             AS name,
    categories.primary        AS category,
    categories.alternate      AS alt_categories,
    confidence,
    bbox.xmin                 AS lng,
    bbox.ymin                 AS lat,
    addresses,
    websites,
    socials,
    phones,
    list_transform(sources, s -> s.dataset) AS source_datasets
  FROM read_parquet(
    's3://overturemaps-us-west-2/release/' || getvariable('overture_release')
      || '/theme=places/type=place/*.parquet',
    hive_partitioning = 1
  )
  WHERE bbox.xmin BETWEEN getvariable('bbox_west')  AND getvariable('bbox_east')
    AND bbox.ymin BETWEEN getvariable('bbox_south') AND getvariable('bbox_north')
    AND confidence >= getvariable('min_confidence')
    AND names.primary IS NOT NULL
    -- The categories a discovery map for homegrown places cares about. Banks,
    -- car dealers and mobile phone shops are real places and not ours.
    AND categories.primary IN (
      'restaurant', 'indian_restaurant', 'cafe', 'coffee_shop', 'bar', 'pub',
      'bakery', 'dessert_shop', 'ice_cream_shop', 'street_vendor', 'food_court',
      'fast_food', 'brewery', 'wine_bar', 'cocktail_bar', 'night_club',
      'tea_room', 'juice_bar',
      'landmark_and_historical_building', 'museum', 'art_gallery', 'monument',
      'park', 'bookstore', 'music_venue', 'performing_arts', 'antique_store',
      'flea_market', 'market'
    )
) TO 'scripts/out/overture-candidates.json' (FORMAT JSON, ARRAY true);
