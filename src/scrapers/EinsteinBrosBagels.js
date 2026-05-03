'use strict';

/**
 * Einstein Bros Bagels Allergen Scraper
 *
 * URL: https://www.einsteinbros.com/allergens/
 *
 * Strategy:
 *   1. Navigate to /allergens/ page
 *   2. Page has an allergen matrix: rows = items, cols = allergens
 *   3. Columns: Milk, Eggs, Fish, Shellfish, Tree Nuts, Peanuts, Wheat, Soy, Sesame
 *   4. Presence marked by icons/checkmarks
 *   5. Fall back to body text scan
 *
 * Note: Einstein Bros is part of the JAB / COSI group (same platform as Noah's Bagels,
 * Manhattan Bagel). The allergen matrix URL may redirect to a PDF or a sub-page.
 */

const BaseScraper = require('./BaseScraper');
const { logger }  = require('../utils/logger');
const { makeEmptyRow, ALLERGENS } = require('../output/schema');

const OFFICIAL_URL = 'https://www.einsteinbros.com/allergens/';
const ALT_URLS     = [
  'https://www.einsteinbros.com/menu/nutrition/',
  'https://www.einsteinbros.com/menu/',
];

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

// Einstein Bros stable core menu
const KNOWN_ITEMS = [
  // Bagels
  { name: 'Plain Bagel',             category: 'Bagels' },
  { name: 'Everything Bagel',        category: 'Bagels' },
  { name: 'Sesame Bagel',            category: 'Bagels' },
  { name: 'Asiago Cheese Bagel',     category: 'Bagels' },
  { name: 'Cinnamon Raisin Swirl Bagel', category: 'Bagels' },
  { name: 'Blueberry Bagel',         category: 'Bagels' },
  { name: 'Whole Wheat Bagel',       category: 'Bagels' },
  { name: 'Pumpernickel Bagel',      category: 'Bagels' },
  { name: 'Honey Whole Wheat Bagel', category: 'Bagels' },
  { name: 'Jalapeno Bagel',          category: 'Bagels' },
  // Schmears / Cream Cheese
  { name: 'Plain Cream Cheese Schmear',         category: 'Schmears' },
  { name: 'Reduced Fat Plain Cream Cheese',     category: 'Schmears' },
  { name: 'Garden Veggie Cream Cheese Schmear', category: 'Schmears' },
  { name: 'Honey Almond Cream Cheese Schmear',  category: 'Schmears' },
  { name: 'Strawberry Cream Cheese Schmear',    category: 'Schmears' },
  { name: 'Jalapeno Salsa Cream Cheese Schmear',category: 'Schmears' },
  // Egg Sandwiches
  { name: 'Classic Egg Sandwich',               category: 'Egg Sandwiches' },
  { name: 'Bacon & Cheddar Egg Sandwich',       category: 'Egg Sandwiches' },
  { name: 'Sausage & Cheddar Egg Sandwich',     category: 'Egg Sandwiches' },
  { name: 'Santa Fe Egg Sandwich',              category: 'Egg Sandwiches' },
  { name: 'Turkey Sausage Egg White Sandwich',  category: 'Egg Sandwiches' },
  // Lunch
  { name: 'Albacore Tuna Salad Sandwich',       category: 'Lunch' },
  { name: 'Farmhouse Chicken Salad Sandwich',   category: 'Lunch' },
  { name: 'Turkey & Swiss Sandwich',            category: 'Lunch' },
  { name: 'Smoked Salmon & Capers Bagel',       category: 'Lunch' },
];

class EinsteinBrosBagels extends BaseScraper {
  constructor() {
    super({ chainName: 'EinsteinBrosBagels', officialUrl: OFFICIAL_URL });
    this._headers = null;
  }

  async discoverMenuItems() {
    let ok = await this.navigateTo(OFFICIAL_URL);
    if (!ok) {
      for (const url of ALT_URLS) {
        ok = await this.navigateTo(url);
        if (ok) break;
      }
    }

    if (!ok) {
      logger.warn('Could not load any Einstein Bros page — using known items', { chain: this.chainName });
      return KNOWN_ITEMS;
    }

    try { await this.page.waitForLoadState('networkidle', { timeout: 25000 }); } catch { /* ok */ }
    await this.page.waitForTimeout(3000);
    await this.takeScreenshot('allergen-page');

    const tableItems = await this._parseTable();
    if (tableItems.length > 0) {
      logger.info(`Table parse: ${tableItems.length} items`, { chain: this.chainName });
      return tableItems;
    }

    const bodyItems = await this._parseBodyText();
    if (bodyItems.length > 0) return bodyItems;

    logger.warn(`Falling back to ${KNOWN_ITEMS.length} known items`, { chain: this.chainName });
    return KNOWN_ITEMS;
  }

  async _parseTable() {
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
      let cat = 'Menu';
      for (let i = 1; i < rows.length; i++) {
        const cells = Array.from(rows[i].querySelectorAll('td, th'));
        if (!cells.length) continue;
        const name = (cells[0].innerText || '').trim();
        if (!name) continue;
        if (cells.length <= 1) { cat = name; continue; }
        const values = cells.slice(1).map(cell => {
          const txt  = (cell.innerText || '').trim().toLowerCase();
          const icon = !!(cell.querySelector('img, svg, [class*="check"], [class*="icon"]'));
          const aria = (cell.getAttribute('aria-label') || '').toLowerCase();
          return (icon || aria.includes('yes') || aria.includes('contain') ||
                  (txt && txt !== '-' && txt !== 'n/a' && txt !== 'no' && txt.length < 6)) ? 'present' : '';
        });
        items.push({ name, category: cat, _values: values });
      }
      return { headers, items };
    });
    if (!data || !data.items.length) return [];
    this._headers = data.headers;
    return data.items;
  }

  async _parseBodyText() {
    const body  = await this.page.innerText('body').catch(() => '');
    const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
    const items = [];
    let cat = 'Menu';
    const seen = new Set();
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (line.length < 50 && /^[A-Z][A-Z\s&\-\/]+$/.test(line)) { cat = line; continue; }
      if (lower.includes('contains') &&
          (lower.includes('milk') || lower.includes('wheat') || lower.includes('soy') ||
           lower.includes('egg') || lower.includes('sesame'))) {
        const name = line.slice(0, 80);
        if (!seen.has(name)) { seen.add(name); items.push({ name, category: cat, _rawText: line }); }
      }
    }
    logger.info(`Body text: ${items.length} items`, { chain: this.chainName });
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
    row.sourceText   = 'Allergen data not accessible — check einsteinbros.com/allergens';
    return row;
  }
}

module.exports = EinsteinBrosBagels;
