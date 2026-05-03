'use strict';

/**
 * Potbelly Allergen Scraper
 *
 * The original /allergens URL is dead (404). Potbelly's allergen data
 * is now accessible via their nutrition calculator at /food/nutrition.
 *
 * Strategy:
 *   1. Navigate to /food/nutrition and parse per-item allergen data
 *   2. Fall back to body text scan
 *   3. Fall back to known items with CNV
 */

const BaseScraper = require('./BaseScraper');
const { logger }  = require('../utils/logger');
const { makeEmptyRow, ALLERGENS } = require('../output/schema');

const OFFICIAL_URL = 'https://www.potbelly.com/food/nutrition';
const ALT_URLS     = [
  'https://www.potbelly.com/menu',
  'https://www.potbelly.com/food',
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

// Comprehensive Potbelly menu
const KNOWN_ITEMS = [
  // Sandwiches (Originals)
  { name: 'A Wreck',                    category: 'Sandwiches' },
  { name: 'Turkey Breast',              category: 'Sandwiches' },
  { name: 'Italian',                    category: 'Sandwiches' },
  { name: 'Grilled Chicken & Cheddar',  category: 'Sandwiches' },
  { name: 'Meatball',                   category: 'Sandwiches' },
  { name: 'Tuna Salad',                 category: 'Sandwiches' },
  { name: 'Mediterranean',              category: 'Sandwiches' },
  { name: 'Roast Beef',                 category: 'Sandwiches' },
  { name: 'Veggie',                     category: 'Sandwiches' },
  { name: 'Ham & Swiss',                category: 'Sandwiches' },
  { name: 'Chicken Salad',              category: 'Sandwiches' },
  { name: 'Grilled Chicken',            category: 'Sandwiches' },
  { name: 'PB&J',                       category: 'Sandwiches' },
  { name: 'Pizza Melt',                 category: 'Sandwiches' },
  // Salads
  { name: 'Farmhouse Salad',            category: 'Salads' },
  { name: 'Classic Cobb Salad',         category: 'Salads' },
  { name: 'Chicken Salad Salad',        category: 'Salads' },
  { name: 'Mediterranean Salad',        category: 'Salads' },
  // Soups
  { name: 'Broccoli Cheddar',           category: 'Soups' },
  { name: 'Chicken Pot Pie',            category: 'Soups' },
  { name: 'Tomato Soup',                category: 'Soups' },
  { name: 'Baked Potato Soup',          category: 'Soups' },
  { name: 'Loaded Baked Potato Soup',   category: 'Soups' },
  // Sides
  { name: 'Mac & Cheese',               category: 'Sides' },
  { name: 'Chips (Regular)',             category: 'Sides' },
  { name: 'Chips (BBQ)',                 category: 'Sides' },
  // Cookies & Shakes
  { name: 'Oatmeal Chocolate Chip Cookie', category: 'Cookies' },
  { name: 'Sugar Cookie',               category: 'Cookies' },
  { name: 'Dream Bar',                  category: 'Cookies' },
  { name: 'Chocolate Brownie Cookie',   category: 'Cookies' },
  { name: 'Vanilla Shake',              category: 'Shakes' },
  { name: 'Chocolate Shake',            category: 'Shakes' },
  { name: 'Oreo Shake',                 category: 'Shakes' },
];

class Potbelly extends BaseScraper {
  constructor() {
    super({ chainName: 'Potbelly', officialUrl: OFFICIAL_URL });
    this._headers = null;
  }

  async discoverMenuItems() {
    // Try the nutrition page first
    let ok = await this.navigateTo(OFFICIAL_URL);
    if (!ok) {
      for (const url of ALT_URLS) {
        ok = await this.navigateTo(url);
        if (ok) break;
      }
    }

    if (!ok) {
      logger.warn('Could not load any Potbelly page — using known items', { chain: this.chainName });
      return KNOWN_ITEMS;
    }

    // Dismiss cookie/promo banners
    await this._dismissBanners();

    try { await this.page.waitForLoadState('networkidle', { timeout: 25000 }); } catch { /* ok */ }
    await this.page.waitForTimeout(3000);
    await this.takeScreenshot('nutrition-page');

    // Check if we landed on a 404 page
    const pageText = await this.page.innerText('body').catch(() => '');
    if (pageText.toLowerCase().includes('oops') || pageText.toLowerCase().includes('not found') ||
        pageText.toLowerCase().includes('404')) {
      logger.warn('Page appears to be a 404 — using known items', { chain: this.chainName });
      await this.takeScreenshot('404-page');
      return KNOWN_ITEMS;
    }

    // Try table parse
    const tableItems = await this._parseTable();
    if (tableItems.length > 0) {
      logger.info(`Table parse: ${tableItems.length} items`, { chain: this.chainName });
      return tableItems;
    }

    // Try to find menu items on the page
    const menuItems = await this._parseMenuPage();
    if (menuItems.length > 0) {
      logger.info(`Menu page parse: ${menuItems.length} items`, { chain: this.chainName });
      return menuItems;
    }

    // Body text
    const bodyItems = await this._parseBodyText();
    if (bodyItems.length > 0) return bodyItems;

    logger.warn(`Falling back to ${KNOWN_ITEMS.length} known items`, { chain: this.chainName });
    return KNOWN_ITEMS;
  }

  async _dismissBanners() {
    try {
      // Close Potbelly Perks popup
      const closeBtn = this.page.locator('button:has-text("✕"), button[aria-label="Close"], .close-button, [class*="close"]').first();
      if (await closeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await closeBtn.click();
        await this.page.waitForTimeout(500);
      }
      // Cookie banner
      const cookieBtn = this.page.locator('button:has-text("Accept"), button:has-text("Manage Preferences")').first();
      if (await cookieBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await cookieBtn.click();
        await this.page.waitForTimeout(500);
      }
    } catch { /* ok */ }
  }

  async _parseMenuPage() {
    // Try to find menu item cards with allergen/nutrition info
    const data = await this.page.evaluate(() => {
      const items = [];
      // Look for menu item elements
      const itemEls = document.querySelectorAll('[class*="menu-item"], [class*="product"], article, .card');
      for (const el of itemEls) {
        const nameEl = el.querySelector('h2, h3, h4, .name, .title, [class*="name"]');
        const name = nameEl ? nameEl.innerText.trim() : '';
        if (!name || name.length < 2 || name.length > 80) continue;

        const text = el.innerText || '';
        items.push({ name, category: 'Menu', _rawText: text });
      }
      return items;
    }).catch(() => []);

    return data;
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
          const icon = !!(cell.querySelector('img, svg, [class*="check"], [class*="icon"], [class*="filled"]'));
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
      // Check if we got real data
      const hasAny = ALLERGENS.some(a => row[a] === 'TRUE');
      if (hasAny) return row;
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
    row.sourceText   = 'Potbelly allergen page no longer exists — check potbelly.com/food/nutrition';
    return row;
  }
}

module.exports = Potbelly;
