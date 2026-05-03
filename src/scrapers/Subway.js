'use strict';

/**
 * Subway Allergen Scraper
 *
 * URL: https://www.subway.com/en-US/MenuNutrition/Nutrition/AllergenMenu
 *
 * Strategy: Subway's website has aggressive bot protection (PerimeterX/Cloudflare).
 * Multiple approaches:
 *   1. Network interception — capture any JSON API responses with allergen data
 *   2. HTML table parse (if page loads)
 *   3. Body text scan
 *   4. Comprehensive known items fallback with CNV
 *
 * Note: The site frequently returns 429s and timeouts in headless mode.
 * Known items fallback is the pragmatic approach.
 */

const BaseScraper = require('./BaseScraper');
const { logger }  = require('../utils/logger');
const { makeEmptyRow, ALLERGENS } = require('../output/schema');

const OFFICIAL_URL  = 'https://www.subway.com/en-US/MenuNutrition/Nutrition/AllergenMenu';
const FALLBACK_URL  = 'https://www.subway.com/en-US/MenuNutrition/Nutrition/NutritionMenu';

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

// Comprehensive Subway menu — stable core items
const KNOWN_ITEMS = [
  // Classic Subs
  { name: 'B.L.T.',                     category: 'Classic Subs' },
  { name: 'Black Forest Ham',           category: 'Classic Subs' },
  { name: 'Cold Cut Combo',             category: 'Classic Subs' },
  { name: 'Italian B.M.T.',             category: 'Classic Subs' },
  { name: 'Meatball Marinara',          category: 'Classic Subs' },
  { name: 'Oven Roasted Turkey',        category: 'Classic Subs' },
  { name: 'Roast Beef',                 category: 'Classic Subs' },
  { name: 'Rotisserie-Style Chicken',   category: 'Classic Subs' },
  { name: 'Spicy Italian',              category: 'Classic Subs' },
  { name: 'Steak & Cheese',             category: 'Classic Subs' },
  { name: 'Subway Club',                category: 'Classic Subs' },
  { name: 'Sweet Onion Chicken Teriyaki', category: 'Classic Subs' },
  { name: 'Tuna',                       category: 'Classic Subs' },
  { name: 'Turkey Breast',              category: 'Classic Subs' },
  { name: 'Veggie Delite',              category: 'Classic Subs' },
  // Signature Wraps
  { name: 'Turkey, Bacon & Avocado Wrap', category: 'Wraps' },
  { name: 'Savory Rotisserie-Style Chicken Caesar Wrap', category: 'Wraps' },
  // Breakfast
  { name: 'Bacon, Egg & Cheese',        category: 'Breakfast' },
  { name: 'Black Forest Ham, Egg & Cheese', category: 'Breakfast' },
  { name: 'Egg & Cheese',               category: 'Breakfast' },
  { name: 'Steak, Egg & Cheese',        category: 'Breakfast' },
  // Salads
  { name: 'Black Forest Ham Salad',     category: 'Salads' },
  { name: 'Oven Roasted Turkey Salad',  category: 'Salads' },
  { name: 'Rotisserie-Style Chicken Salad', category: 'Salads' },
  { name: 'Veggie Delite Salad',        category: 'Salads' },
  // Bread
  { name: 'Artisan Italian (White)',    category: 'Bread' },
  { name: 'Hearty Multigrain',          category: 'Bread' },
  { name: 'Italian Herbs & Cheese',     category: 'Bread' },
  { name: '9-Grain Wheat',              category: 'Bread' },
  { name: 'Flatbread',                  category: 'Bread' },
  // Sides & Cookies
  { name: 'Chocolate Chip Cookie',      category: 'Cookies & Sides' },
  { name: 'Double Chocolate Cookie',    category: 'Cookies & Sides' },
  { name: 'Oatmeal Raisin Cookie',      category: 'Cookies & Sides' },
  { name: 'White Chip Macadamia Nut Cookie', category: 'Cookies & Sides' },
  { name: 'Apple Slices',               category: 'Cookies & Sides' },
];

class Subway extends BaseScraper {
  constructor() {
    super({ chainName: 'Subway', officialUrl: OFFICIAL_URL });
    this._headers = null;
    this._interceptedData = null;
  }

  async discoverMenuItems() {
    // Set up network interception BEFORE navigation
    const interceptedResponses = [];
    this.page.on('response', async (response) => {
      try {
        const url = response.url();
        const ct  = response.headers()['content-type'] || '';
        // Look for JSON API responses that might contain allergen/nutrition data
        if (ct.includes('json') &&
            (url.includes('nutrition') || url.includes('allergen') || url.includes('menu') || url.includes('product'))) {
          const body = await response.text().catch(() => null);
          if (body && body.length > 100) {
            interceptedResponses.push({ url, body });
          }
        }
      } catch { /* ok */ }
    });

    // Try navigating with a longer timeout and randomized user agent
    let ok = await this.navigateTo(OFFICIAL_URL);
    if (!ok) {
      logger.warn('Primary URL failed — trying fallback', { chain: this.chainName });
      ok = await this.navigateTo(FALLBACK_URL);
    }
    if (!ok) {
      logger.warn('Both URLs failed — using known items', { chain: this.chainName });
      return KNOWN_ITEMS;
    }

    try { await this.page.waitForLoadState('networkidle', { timeout: 25000 }); } catch { /* ok */ }
    await this.page.waitForTimeout(5000); // Extra wait for heavily JS-rendered content
    await this.takeScreenshot('allergen-page');

    // Check intercepted data first
    if (interceptedResponses.length > 0) {
      const items = this._parseInterceptedData(interceptedResponses);
      if (items.length > 0) {
        logger.info(`Network intercept: ${items.length} items`, { chain: this.chainName });
        return items;
      }
    }

    // Expand all accordion sections if present
    await this._expandAccordions();

    const tableItems = await this._parseTable();
    if (tableItems.length > 0) {
      logger.info(`Table parse: ${tableItems.length} items`, { chain: this.chainName });
      return tableItems;
    }

    const bodyItems = await this._parseBodyText();
    if (bodyItems.length > 0) return bodyItems;

    // Known items fallback
    logger.warn(`Falling back to ${KNOWN_ITEMS.length} known items`, { chain: this.chainName });
    return KNOWN_ITEMS;
  }

  _parseInterceptedData(responses) {
    const items = [];
    for (const { url, body } of responses) {
      try {
        const data = JSON.parse(body);
        // Try to find allergen arrays in the response
        const flatten = (obj, path = '') => {
          if (Array.isArray(obj)) {
            for (const item of obj) {
              if (item && typeof item === 'object' && (item.name || item.Name || item.title || item.itemName)) {
                const name = item.name || item.Name || item.title || item.itemName;
                const allergenText = JSON.stringify(item);
                if (allergenText.toLowerCase().includes('allergen') ||
                    allergenText.toLowerCase().includes('milk') ||
                    allergenText.toLowerCase().includes('wheat')) {
                  items.push({
                    name: String(name).slice(0, 80),
                    category: item.category || item.Category || 'Menu',
                    _rawText: allergenText,
                  });
                }
              }
            }
          } else if (obj && typeof obj === 'object') {
            for (const [k, v] of Object.entries(obj)) {
              flatten(v, `${path}.${k}`);
            }
          }
        };
        flatten(data);
      } catch { /* ok */ }
    }
    return items;
  }

  async _expandAccordions() {
    try {
      const buttons = await this.page.$$('button[aria-expanded="false"], [class*="accordion"] button, [class*="collapse"] button');
      for (const btn of buttons) {
        try { await btn.click(); await this.page.waitForTimeout(300); } catch { /* ok */ }
      }
    } catch { /* ok */ }
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

    logger.info(`Body text fallback: ${items.length} items`, { chain: this.chainName });
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

    // CNV fallback
    for (const a of ALLERGENS) row[a] = 'COULD_NOT_VERIFY';
    row.crossContact = 'COULD_NOT_VERIFY';
    row.confidence   = 'COULD_NOT_VERIFY';
    row.sourceText   = 'Subway site heavily bot-protected — allergen data not extractable in headless mode. Check subway.com allergen menu.';
    return row;
  }
}

module.exports = Subway;
