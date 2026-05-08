-- Allerva Database Migration
-- Compatible with: Supabase (PostgreSQL 15+), GCP Cloud SQL, GCP AlloyDB
-- Run this in the Supabase SQL Editor or via psql before running seed.js

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE allergen_status AS ENUM ('TRUE', 'FALSE', 'COULD_NOT_VERIFY');
CREATE TYPE confidence_level AS ENUM ('HIGH', 'LOW', 'COULD_NOT_VERIFY');
CREATE TYPE chain_status     AS ENUM (
  'DONE_LIVE',    -- live browser/API scraping, TRUE/FALSE data
  'DONE_AI',      -- AI sidecar extracted TRUE/FALSE
  'DONE_PDF',     -- PDF-extracted TRUE/FALSE
  'DONE_CNV',     -- checkpoint exists but all CNV or FALSE
  'DATA_ISSUE',   -- checkpoint exists, poor quality
  'BLOCKED'       -- 0-row checkpoint; bot protection or unavailable
);

-- ---------------------------------------------------------------------------
-- Table: restaurants
-- One row per restaurant chain (53 rows at initial seed)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS restaurants (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  cli_key          text         UNIQUE NOT NULL,
  display_name     text         NOT NULL,
  status           chain_status,
  scrape_strategy  text,
  notes            text,
  created_at       timestamptz  DEFAULT now(),
  updated_at       timestamptz  DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Table: scrape_runs
-- One row per checkpoint savedAt (audit trail per chain per run)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS scrape_runs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  saved_at       timestamptz NOT NULL,
  row_count      integer     NOT NULL DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scrape_runs_restaurant_id ON scrape_runs(restaurant_id);

-- ---------------------------------------------------------------------------
-- Table: menu_items
-- One row per menu item. Wide format: one column per allergen.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS menu_items (
  id              uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   uuid             NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  scrape_run_id   uuid             REFERENCES scrape_runs(id),
  menu_category   text,
  item_name       text             NOT NULL,

  -- 9 major allergens (FDA Big 9)
  milk            allergen_status  NOT NULL DEFAULT 'COULD_NOT_VERIFY',
  eggs            allergen_status  NOT NULL DEFAULT 'COULD_NOT_VERIFY',
  fish            allergen_status  NOT NULL DEFAULT 'COULD_NOT_VERIFY',
  shellfish       allergen_status  NOT NULL DEFAULT 'COULD_NOT_VERIFY',
  tree_nuts       allergen_status  NOT NULL DEFAULT 'COULD_NOT_VERIFY',
  peanuts         allergen_status  NOT NULL DEFAULT 'COULD_NOT_VERIFY',
  wheat           allergen_status  NOT NULL DEFAULT 'COULD_NOT_VERIFY',
  soy             allergen_status  NOT NULL DEFAULT 'COULD_NOT_VERIFY',
  sesame          allergen_status  NOT NULL DEFAULT 'COULD_NOT_VERIFY',

  -- metadata
  cross_contact   allergen_status  NOT NULL DEFAULT 'COULD_NOT_VERIFY',
  confidence      confidence_level NOT NULL DEFAULT 'COULD_NOT_VERIFY',
  source_url      text,
  source_text     text,
  scrape_date     timestamptz,
  created_at      timestamptz      DEFAULT now()
);

-- Indexes for allergen filter queries (e.g. "show peanut-free items")
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_id ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_scrape_run_id ON menu_items(scrape_run_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_milk           ON menu_items(milk);
CREATE INDEX IF NOT EXISTS idx_menu_items_eggs           ON menu_items(eggs);
CREATE INDEX IF NOT EXISTS idx_menu_items_fish           ON menu_items(fish);
CREATE INDEX IF NOT EXISTS idx_menu_items_shellfish      ON menu_items(shellfish);
CREATE INDEX IF NOT EXISTS idx_menu_items_tree_nuts      ON menu_items(tree_nuts);
CREATE INDEX IF NOT EXISTS idx_menu_items_peanuts        ON menu_items(peanuts);
CREATE INDEX IF NOT EXISTS idx_menu_items_wheat          ON menu_items(wheat);
CREATE INDEX IF NOT EXISTS idx_menu_items_soy            ON menu_items(soy);
CREATE INDEX IF NOT EXISTS idx_menu_items_sesame         ON menu_items(sesame);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items  ENABLE ROW LEVEL SECURITY;

-- Public read: allergen data is non-sensitive
CREATE POLICY "public read restaurants" ON restaurants FOR SELECT USING (true);
CREATE POLICY "public read scrape_runs" ON scrape_runs FOR SELECT USING (true);
CREATE POLICY "public read menu_items"  ON menu_items  FOR SELECT USING (true);

-- Writes require the service role key (used by seed.js only)
-- No INSERT/UPDATE/DELETE policies — service role bypasses RLS by default in Supabase

-- ---------------------------------------------------------------------------
-- Verification queries (run after seed.js to confirm data loaded correctly)
-- ---------------------------------------------------------------------------

-- SELECT r.display_name, r.status, COUNT(m.id) AS item_count
-- FROM restaurants r
-- LEFT JOIN menu_items m ON m.restaurant_id = r.id
-- GROUP BY r.display_name, r.status
-- ORDER BY item_count DESC;

-- SELECT item_name, menu_category, peanuts, wheat, milk
-- FROM menu_items m
-- JOIN restaurants r ON r.id = m.restaurant_id
-- WHERE r.cli_key = 'mcdonalds' AND peanuts = 'FALSE' AND wheat = 'FALSE';
