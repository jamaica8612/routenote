-- Add pin position and icon columns to rn_market_buildings
ALTER TABLE rn_market_buildings
  ADD COLUMN IF NOT EXISTS pos_lat NUMERIC,
  ADD COLUMN IF NOT EXISTS pos_lng NUMERIC,
  ADD COLUMN IF NOT EXISTS icon TEXT;

-- Set default icons for each building
UPDATE rn_market_buildings SET icon = '🍎' WHERE code = 'cheonggwamul';
UPDATE rn_market_buildings SET icon = '🥬' WHERE code = 'mubaechu';
UPDATE rn_market_buildings SET icon = '🌶️' WHERE code = 'yangnyeom';
UPDATE rn_market_buildings SET icon = '🌸' WHERE code = 'hwahwe';
