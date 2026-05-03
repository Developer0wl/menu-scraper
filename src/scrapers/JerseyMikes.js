'use strict';

/**
 * Jersey Mike's Allergen Scraper
 *
 * URL: https://www.jerseymikes.com/menu/nutrition
 *
 * Strategy:
 *   1. Navigate to the nutrition page
 *   2. The page has sub selector dropdowns / tabs for each sub type
 *   3. Allergen info is per-item (not a matrix) — look for "Contains:" text in item detail
 *   4. Extract all subs + bread types from the menu
 *   5. Fall back to body text scan for allergen mentions
 *
 * Note: Jersey Mike's allergen data is accessible via a PDF guide and also
 * per-item on their nutrition calculator. The per-item approach is used here.
 */

const BaseScraper = require('./BaseScraper');
const { logger }  = require('../utils/logger');
const { makeEmptyRow, ALLERGENS } = require('../output/schema');

const OFFICIAL_URL  = 'https://www.jerseymikes.com/menu/nutrition';
const ALLERGEN_URL  = 'https://www.jerseymikes.com/menu/nutrition';

const COLUMN_MAP = {
  'milk':       'milk',
  'dairy':      'milk',
  'egg':        'eggs',
  'eggs':       'eggs',
  'fish':       'fish',
  'shellfish':  'shellfish',
  'tree nut':   'treeNuts',
  'tree nuts':  'treeNuts',
  'peanut':     'peanuts',
  'peanuts':    'peanuts',
  'wheat':      'wheat',
  'gluten':     'wheat',
  'soy':        'soy',
  'soybean':    'soy',
  'sesame':     'sesame',
};

// Stable Jersey Mike's menu (subs are the core product)
const KNOWN_ITEMS = [
  // Cold Subs (The Originals)
  { name: 'BLT', category: 'Cold Subs' },
  { name: 'Turkey', category: 'Cold Subs' },
  { name: 'Club Sub', category: 'Cold Subs' },
  { name: 'Ham and Provolone', category: 'Cold Subs' },
  { name: 'Roast Beef and Provolone', category: 'Cold Subs' },
  { name: 'Tuna Fish', category: 'Cold Subs' },
  { name: 'Veggie', category: 'Cold Subs' },
  { name: 'Super Sub', category: 'Cold Subs' },
  { name: 'Club Supreme', category: 'Cold Subs' },
  { name: 'The American Classic', category: 'Cold Subs' },
  // Hot Subs
  { name: 'Meatball and Cheese', category: 'Hot Subs' },
  { name: 'Chicken Philly Cheese Steak', category: 'Hot Subs' },
  { name: 'Philly Cheese Steak', category: 'Hot Subs' },
  { name: 'Grilled Pastrami Reuben', category: 'Hot Subs' },
  { name: 'Big Kahuna Cheese Steak', category: 'Hot Subs' },
  { name: 'Chicken California Cheese Steak', category: 'Hot Subs' },
  { name: 'Steak Philly', category: 'Hot Subs' },
  // Wraps
  { name: 'Turkey Wrap', category: 'Wraps' },
  { name: 'Club Wrap', category: 'Wraps' },
  { name: 'Chicken Caesar Wrap', category: 'Wraps' },
];

class JerseyMikes extends BaseScraper {
  constructor() {
    super({ chainName: 'JerseyMikes', officialUrl: OFFICIAL_URL });
    this._headers = null;
    this._liveItems = null;
  }

  async discoverMenuItems() {
    const ok = await this.navigateTo(OFFICIAL_URL);
    if (!ok) {
      logger.warn('Could not load nutrition page — using known items', { chain: this.chainName });
      return KNOWN_ITEMS;
    }

    try { await this.page.waitForLoadState('networkidle', { timeout: 25000 }); } catch { /* ok */ }
    await this.page.waitForTimeout(3000);
    await this.takeScreenshot('nutrition-page');

    // Try to find an allergen table
    const tableItems = await this._parseAllergenTable();
    if (tableItems.length > 0) {
      logger.info(`Table parse: ${tableItems.length} items`, { chain: this.chainName });
      this._liveItems = tableItems;
      return tableItems;
    }

    // Try body text allergen scan
    const bodyItems = await this._parseBodyAllergens();
    if (bodyItems.length > 0) {
      logger.info(`Body parse: ${bodyItems.length} items`, { chain: this.chainName });
      return bodyItems;
    }

    // Use known items with CNV
    logger.warn(`Falling back to ${KNOWN_ITEMS.length} known items`, { chain: this.chainName });
    return KNOWN_ITEMS;
  }

  async _parseAllergenTable() {
    const data = await this.page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('table'));
      if (!tables.length) return null;
      const best = tables.reduce((a, b) =>
        b.querySelectorAll('tr').length > a.querySelectorAll('tr').length ? b : a);
      const rows = Array.from(best.querySelectorAll('tr'));
      if (rows.length < 2) return null;
      const headers = Array.from(rows[0].querySelectorAll('th, td'))
        .map(c => (c.innerText || '').trim().toLowerCase());
      const items = [];
      let cat = 'Subs';
      for (let i = 1; i < rows.length; i++) {
        const cells = Array.from(rows[i].querySelectorAll('td, th'));
        if (!cells.length) continue;
        const name = (cells[0].innerText || '').trim();
        if (!name) continue;
        if (cells.length <= 1) { cat = name; continue; }
        const values = cells.slice(1).map(cell => {
          const txt  = (cell.innerText || '').trim().toLowerCase();
          const icon = !!(cell.querySelector('img, svg, [class*="check"]'));
          return (icon || (txt && txt !== '-' && txt !== 'n/a' && txt !== 'no' && txt.length < 6)) ? 'present' : '';
        });
        items.push({ name, category: cat, _values: values });
      }
      return { headers, items };
    });
    if (!data || !data.items.length) return [];
    this._headers = data.headers;
    return data.items;
  }

  async _parseBodyAllergens() {
    const body  = await this.page.innerText('body').catch(() => '');
    const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
    const items = [];
    let cat = 'Subs';
    const seen = new Set();

    for (let i = 0; i < lines.length; i++) {
      const line  = lines[i];
      const lower = line.toLowerCase();
      if (line.length < 50 && /^[A-Z][A-Z\s&\-\/]+$/.test(line)) { cat = line; continue; }
      if (lower.includes('contains') &&
          (lower.includes('milk') || lower.includes('wheat') || lower.includes('soy') ||
           lower.includes('egg') || lower.includes('sesame'))) {
        const name = line.split(':')[0].slice(0, 80).trim() || line.slice(0, 80);
        if (!seen.has(name)) {
          seen.add(name);
          items.push({ name, category: cat, _rawText: line });
        }
      }
    }
    return items;
  }

  async extractAllergens(item) {
    const row = makeEmptyRow();
    row.menuCategory = item.category;
    row.itemName     = item.name;
    row.sourceUrl    = OFFICIAL_URL;
    row.scrapeDate   = new Date().toISOString();

    if (item._rawText) {
      const parsed = this.parseAllergenText(item._rawText);
      Object.assign(row, parsed);
      return row;
    }

    if (item._values && this._headers) {
      const present = [];
      let anyMapped = false;
      this._headers.forEach((header, i) => {
        const key = COLUMN_MAP[header];
        if (!key) return;
        const isPresent = item._values[i - 1] === 'present';
        if (isPresent) present.push(header);
        row[key] = isPresent ? 'TRUE' : 'FALSE';
        anyMapped = true;
      });
      if (anyMapped) {
        row.confidence   = 'HIGH';
        row.crossContact = 'NO';
        row.sourceText   = present.length > 0 ? `Contains: ${present.join(', ')}` : 'No allergens listed';
        return row;
      }
    }

    for (const a of ALLERGENS) row[a] = 'COULD_NOT_VERIFY';
    row.crossContact = 'COULD_NOT_VERIFY';
    row.confidence   = 'COULD_NOT_VERIFY';
    row.sourceText   = 'Allergen data not accessible via HTML — check jerseymikes.com/menu/nutrition';
    return row;
  }
}

module.exports = JerseyMikes;
