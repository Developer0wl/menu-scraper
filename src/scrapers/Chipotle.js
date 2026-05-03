'use strict';

/**
 * Chipotle Allergen Scraper
 *
 * Strategy: static allergen table at https://www.chipotle.com/allergens
 *
 * Key facts from DOM inspection:
 *   - Table is inside div.allergenstable
 *   - Columns: [disclaimer text, DAIRY, SOY, GLUTEN, SULPHITES]
 *   - Chipotle explicitly states they do NOT use eggs, mustard, peanuts,
 *     tree nuts, sesame, shellfish, or fish as ingredients — all FALSE
 *   - Cell presence is indicated by child elements (img/svg), NOT innerText
 *   - 26 ingredient rows (this is the full ingredient list, not combo items)
 */

const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow, ALLERGENS } = require('../output/schema');

const ALLERGEN_URL = 'https://www.chipotle.com/allergens';

// Chipotle only varies on these 3 allergens — rest are FALSE per their disclaimer
const CHIPOTLE_STATIC_FALSE = ['eggs', 'fish', 'shellfish', 'treeNuts', 'peanuts', 'sesame'];

// Column index (1-based, skipping item-name column at index 0) → allergen key
// Table headers: [disclaimer/item-name, DAIRY, SOY, GLUTEN, SULPHITES]
const COL_TO_ALLERGEN = {
  1: 'milk',    // DAIRY
  2: 'soy',     // SOY
  3: 'wheat',   // GLUTEN
  // col 4 = SULPHITES — not one of our 9 tracked allergens, skip
};

class Chipotle extends BaseScraper {
  constructor() {
    super({ chainName: 'Chipotle', officialUrl: ALLERGEN_URL });
    this._tableData = null;
  }

  async discoverMenuItems() {
    const ok = await this.navigateTo(ALLERGEN_URL);
    if (!ok) {
      logger.error('Could not load allergen page', { chain: this.chainName });
      return [];
    }

    // SPA — wait for table to hydrate
    try { await this.page.waitForLoadState('networkidle', { timeout: 20000 }); } catch { /* ok */ }
    try { await this.page.waitForSelector('.allergenstable table, table', { timeout: 15000 }); } catch { /* ok */ }
    await this.page.waitForTimeout(2000);
    await this.takeScreenshot('allergen-table');

    const data = await this._parseTable();
    if (!data || data.length === 0) {
      logger.error('No items parsed from allergen table', { chain: this.chainName });
      return [];
    }

    logger.info(`Discovered ${data.length} items from Chipotle allergen table`, { chain: this.chainName });
    return data;
  }

  async _parseTable() {
    return await this.page.evaluate(() => {
      // Prefer the table inside .allergenstable; fall back to any table
      const table = document.querySelector('.allergenstable table') ||
                    document.querySelector('table');
      if (!table) return [];

      const rows = Array.from(table.querySelectorAll('tr'));
      if (rows.length < 2) return [];

      const items = [];
      // Skip row 0 (headers): ['disclaimer', 'DAIRY', 'SOY', 'GLUTEN', 'SULPHITES']
      for (let i = 1; i < rows.length; i++) {
        const cells = Array.from(rows[i].querySelectorAll('td, th'));
        if (cells.length < 2) continue;
        const name = (cells[0].innerText || '').trim();
        if (!name || name.length < 2) continue;

        // Chipotle uses img/svg checkmarks — presence = has an img or svg child,
        // or non-trivial text. childElementCount > 0 is too broad (wrapper spans fire it).
        const colValues = [];
        for (let c = 1; c < cells.length; c++) {
          const cell        = cells[c];
          const txt         = (cell.innerText || '').trim();
          const hasCheckmark = !!(cell.querySelector('img, svg, [class*="check"], [class*="mark"], [class*="icon"]'));
          const aria        = (cell.getAttribute('aria-label') || '').toLowerCase();
          const isPresent   = hasCheckmark ||
                              aria.includes('yes') || aria.includes('contain') ||
                              (txt && txt !== '-' && txt !== 'n/a' && txt !== '' && txt.length < 10);
          colValues.push(isPresent ? 'present' : '');
        }
        items.push({ name, category: 'Ingredients', colValues });
      }
      return items;
    });
  }

  async extractAllergens(item) {
    const row = makeEmptyRow();
    row.menuCategory = item.category || 'Ingredients';
    row.itemName     = item.name;
    row.sourceUrl    = ALLERGEN_URL;
    row.scrapeDate   = new Date().toISOString();

    // Static FALSE for allergens Chipotle declares they never use
    for (const a of CHIPOTLE_STATIC_FALSE) {
      row[a] = 'FALSE';
    }

    if (!item.colValues) {
      return this.buildCNVRow(item.category, item.name, ALLERGEN_URL, 'No column data');
    }

    const presentAllergens = [];
    for (const [colIdx, allergenKey] of Object.entries(COL_TO_ALLERGEN)) {
      const idx = parseInt(colIdx, 10) - 1; // colValues is 0-indexed from col 1
      const isPresent = !!(item.colValues[idx]);
      row[allergenKey] = isPresent ? 'TRUE' : 'FALSE';
      if (isPresent) presentAllergens.push(allergenKey);
    }

    row.confidence   = 'HIGH';
    row.crossContact = 'NO';
    row.sourceText   = presentAllergens.length > 0
      ? `Contains: ${presentAllergens.join(', ')}. Note: Chipotle does not use eggs, peanuts, tree nuts, sesame, shellfish, or fish.`
      : 'No allergens from Dairy/Soy/Gluten columns. Chipotle does not use eggs, peanuts, tree nuts, sesame, shellfish, or fish.';

    return row;
  }
}

module.exports = Chipotle;
