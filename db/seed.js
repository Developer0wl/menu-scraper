'use strict';

/**
 * Allerva DB Seed Script
 *
 * Reads all checkpoint JSONs from ../checkpoints/ and upserts data into Supabase.
 * Run migration.sql first, then:
 *
 *   $env:SUPABASE_URL="https://xxxx.supabase.co"
 *   $env:SUPABASE_SERVICE_KEY="eyJ..."
 *   node db/seed.js
 *
 * Optional flags:
 *   --dry-run   Print counts only, no DB writes
 *   --chain mcdonalds  Seed a single chain only
 */

const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { RESTAURANTS } = require('./restaurants_seed');

const CHECKPOINTS_DIR = path.join(__dirname, '..', 'checkpoints');
const BATCH_SIZE = 200;

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN    = args.includes('--dry-run');
const chainArg   = args.includes('--chain') ? args[args.indexOf('--chain') + 1] : null;

// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)) {
  console.error('ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars before running.');
  console.error('  $env:SUPABASE_URL="https://xxxx.supabase.co"');
  console.error('  $env:SUPABASE_SERVICE_KEY="eyJ..."');
  process.exit(1);
}

const supabase = DRY_RUN ? null : createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadCheckpoint(cliKey) {
  const file = path.join(CHECKPOINTS_DIR, `${cliKey}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// Strip local screenshot paths from sourceText
// e.g. "Contains: Wheat | screenshot:C:\Users\..." → "Contains: Wheat"
function cleanSourceText(raw) {
  if (!raw) return null;
  const idx = raw.indexOf(' | screenshot:');
  if (idx !== -1) return raw.slice(0, idx).trim() || null;
  if (raw.startsWith('screenshot:')) return null;
  return raw.trim() || null;
}

// Map JS camelCase allergen values → SQL enum values
// Values are already 'TRUE'/'FALSE'/'COULD_NOT_VERIFY' — pass through
function toStatus(val) {
  if (val === 'TRUE')  return 'TRUE';
  if (val === 'FALSE') return 'FALSE';
  return 'COULD_NOT_VERIFY';
}

function toConfidence(val) {
  if (val === 'HIGH') return 'HIGH';
  if (val === 'LOW')  return 'LOW';
  return 'COULD_NOT_VERIFY';
}

async function insertBatch(table, rows) {
  if (DRY_RUN) return;
  const { error } = await supabase.from(table).insert(rows);
  if (error) throw new Error(`Insert into ${table} failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(DRY_RUN ? '\n=== DRY RUN (no DB writes) ===\n' : '\n=== Allerva DB Seed ===\n');

  const targets = chainArg
    ? RESTAURANTS.filter(r => r.cli_key === chainArg)
    : RESTAURANTS;

  if (targets.length === 0) {
    console.error(`No matching chain found for --chain ${chainArg}`);
    process.exit(1);
  }

  let totalRestaurants = 0;
  let totalItems       = 0;
  let totalRuns        = 0;
  const errors         = [];

  for (const meta of targets) {
    const { cli_key, display_name, status, scrape_strategy, notes } = meta;

    // 1. Upsert restaurant row
    const restaurantRow = { cli_key, display_name, status, scrape_strategy, notes };
    let restaurantId;

    if (!DRY_RUN) {
      const { data, error } = await supabase
        .from('restaurants')
        .upsert(restaurantRow, { onConflict: 'cli_key' })
        .select('id')
        .single();
      if (error) {
        errors.push(`[${cli_key}] restaurants upsert failed: ${error.message}`);
        continue;
      }
      restaurantId = data.id;
    }
    totalRestaurants++;

    // 2. Load checkpoint
    const checkpoint = loadCheckpoint(cli_key);
    if (!checkpoint || !checkpoint.rows || checkpoint.rows.length === 0) {
      console.log(`  [${cli_key}] No checkpoint rows — restaurant row written, skipping items.`);
      continue;
    }

    // 3. Insert scrape_run row
    let scrapeRunId;
    if (!DRY_RUN) {
      const { data, error } = await supabase
        .from('scrape_runs')
        .insert({
          restaurant_id: restaurantId,
          saved_at:      checkpoint.savedAt,
          row_count:     checkpoint.rowCount ?? checkpoint.rows.length,
        })
        .select('id')
        .single();
      if (error) {
        errors.push(`[${cli_key}] scrape_runs insert failed: ${error.message}`);
        continue;
      }
      scrapeRunId = data.id;
    }
    totalRuns++;

    // 4. Build menu_items rows
    const itemRows = checkpoint.rows.map(row => ({
      restaurant_id: restaurantId ?? 'DRY_RUN',
      scrape_run_id: scrapeRunId  ?? 'DRY_RUN',
      menu_category: row.menuCategory || null,
      item_name:     row.itemName,
      milk:          toStatus(row.milk),
      eggs:          toStatus(row.eggs),
      fish:          toStatus(row.fish),
      shellfish:     toStatus(row.shellfish),
      tree_nuts:     toStatus(row.treeNuts),
      peanuts:       toStatus(row.peanuts),
      wheat:         toStatus(row.wheat),
      soy:           toStatus(row.soy),
      sesame:        toStatus(row.sesame),
      cross_contact: toStatus(row.crossContact),
      confidence:    toConfidence(row.confidence),
      source_url:    row.sourceUrl   || null,
      source_text:   cleanSourceText(row.sourceText),
      scrape_date:   row.scrapeDate  || null,
    }));

    // 5. Batch insert menu_items
    for (let i = 0; i < itemRows.length; i += BATCH_SIZE) {
      const batch = itemRows.slice(i, i + BATCH_SIZE);
      try {
        await insertBatch('menu_items', batch);
      } catch (err) {
        errors.push(`[${cli_key}] batch ${i}–${i + batch.length}: ${err.message}`);
      }
    }

    totalItems += itemRows.length;
    console.log(`  [${cli_key}] ${display_name}: ${itemRows.length} items inserted (status: ${status})`);
  }

  // Summary
  console.log('\n--- Seed Summary ---');
  console.log(`  Restaurants: ${totalRestaurants}`);
  console.log(`  Scrape runs: ${totalRuns}`);
  console.log(`  Menu items:  ${totalItems}`);
  if (errors.length) {
    console.error(`\n  ERRORS (${errors.length}):`);
    errors.forEach(e => console.error(`    ${e}`));
    process.exit(1);
  } else {
    console.log('\n  Done. No errors.');
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
