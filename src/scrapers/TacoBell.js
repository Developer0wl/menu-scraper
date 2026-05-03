'use strict';

/**
 * Taco Bell Allergen Scraper
 *
 * Strategy: The tacobell.com allergen page embeds a Nutritionix iframe.
 * We navigate directly to the Nutritionix URL which renders a filterable
 * menu with per-item allergen labels. We parse the Nutritionix page
 * instead of the parent Taco Bell frame.
 *
 * Fallback: comprehensive known-items list with CNV.
 */

const BaseScraper = require('./BaseScraper');
const { logger }  = require('../utils/logger');
const { makeEmptyRow, ALLERGENS } = require('../output/schema');

const OFFICIAL_URL    = 'https://www.tacobell.com/nutrition/allergen-info';
const NUTRITIONIX_URL = 'https://www.nutritionix.com/taco-bell/menu/special-diets/premium';

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

// Comprehensive Taco Bell menu — stable core items
const KNOWN_ITEMS = [
  // Tacos
  { name: 'Crunchy Taco',                category: 'Tacos' },
  { name: 'Crunchy Taco Supreme',        category: 'Tacos' },
  { name: 'Soft Taco',                   category: 'Tacos' },
  { name: 'Soft Taco Supreme',           category: 'Tacos' },
  { name: 'Doritos Locos Tacos',         category: 'Tacos' },
  { name: 'Doritos Locos Tacos Supreme', category: 'Tacos' },
  { name: 'Chalupa Supreme',             category: 'Tacos' },
  { name: 'Gordita Crunch',              category: 'Tacos' },
  { name: 'Nacho Cheese Doritos Locos Taco', category: 'Tacos' },
  // Burritos
  { name: 'Bean Burrito',                category: 'Burritos' },
  { name: 'Beefy 5-Layer Burrito',       category: 'Burritos' },
  { name: 'Burrito Supreme',             category: 'Burritos' },
  { name: 'Cheesy Bean and Rice Burrito', category: 'Burritos' },
  { name: 'Chicken Burrito',             category: 'Burritos' },
  { name: 'Steak Burrito',               category: 'Burritos' },
  { name: 'Quesarito',                   category: 'Burritos' },
  { name: 'Grilled Cheese Burrito',      category: 'Burritos' },
  // Quesadillas
  { name: 'Chicken Quesadilla',          category: 'Quesadillas' },
  { name: 'Steak Quesadilla',            category: 'Quesadillas' },
  { name: 'Cheese Quesadilla',           category: 'Quesadillas' },
  // Nachos
  { name: 'Nachos BellGrande',           category: 'Nachos' },
  { name: 'Chips and Nacho Cheese Sauce', category: 'Nachos' },
  // Specialties
  { name: 'Mexican Pizza',               category: 'Specialties' },
  { name: 'Crunchwrap Supreme',          category: 'Specialties' },
  { name: 'Cheesy Gordita Crunch',       category: 'Specialties' },
  { name: 'Power Menu Bowl',             category: 'Specialties' },
  // Sides
  { name: 'Cinnamon Twists',             category: 'Sides' },
  { name: 'Pintos n Cheese',             category: 'Sides' },
  { name: 'Cheesy Fiesta Potatoes',      category: 'Sides' },
  // Drinks
  { name: 'Baja Blast',                  category: 'Drinks' },
  { name: 'Baja Blast Freeze',           category: 'Drinks' },
];

class TacoBell extends BaseScraper {
  constructor() {
    super({ chainName: 'TacoBell', officialUrl: OFFICIAL_URL });
    this._headers = null;
  }

  async discoverMenuItems() {
    // Strategy 1: Navigate directly to Nutritionix embed
    const ok = await this.navigateTo(NUTRITIONIX_URL);
    if (!ok) {
      logger.warn('Nutritionix URL unreachable — trying official URL', { chain: this.chainName });
      const ok2 = await this.navigateTo(OFFICIAL_URL);
      if (!ok2) {
        logger.warn('Official URL also unreachable — using known items', { chain: this.chainName });
        return KNOWN_ITEMS;
      }
    }

    // Dismiss cookie banners
    await this._dismissBanners();

    try { await this.page.waitForLoadState('networkidle', { timeout: 25000 }); } catch { /* ok */ }
    await this.page.waitForTimeout(3000);
    await this.takeScreenshot('allergen-page');

    // Strategy 1: Look for Nutritionix menu items with allergen data
    const nxItems = await this._parseNutritionix();
    if (nxItems.length > 0) {
      logger.info(`Nutritionix parse: ${nxItems.length} items`, { chain: this.chainName });
      return nxItems;
    }

    // Strategy 2: Generic table parse
    const tableItems = await this._parseTable();
    if (tableItems.length > 0) {
      logger.info(`Table parse: ${tableItems.length} items`, { chain: this.chainName });
      return tableItems;
    }

    // Strategy 3: Body text scan
    const bodyItems = await this._parseBodyText();
    if (bodyItems.length > 0) return bodyItems;

    // Fallback: known items
    logger.warn(`Falling back to ${KNOWN_ITEMS.length} known items`, { chain: this.chainName });
    return KNOWN_ITEMS;
  }

  async _dismissBanners() {
    try {
      // Taco Bell cookie banner
      const agreeBtn = this.page.locator('button:has-text("AGREE"), button:has-text("Accept"), button:has-text("OK")').first();
      if (await agreeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await agreeBtn.click();
        await this.page.waitForTimeout(500);
      }
    } catch { /* ok */ }
  }

  async _parseNutritionix() {
    // Nutritionix renders menu items as cards or list items with allergen tags
    const data = await this.page.evaluate(() => {
      const items = [];
      
      // Look for item containers in Nutritionix
      const itemEls = document.querySelectorAll('.item, .menu-item, [class*="item"], .nf-item, li[data-item]');
      for (const el of itemEls) {
        const nameEl = el.querySelector('.item-name, .name, h3, h4, .title, [class*="name"]');
        const name = nameEl ? nameEl.innerText.trim() : '';
        if (!name || name.length < 2 || name.length > 80) continue;

        // Look for allergen labels within the item
        const allergenText = el.innerText || '';
        if (allergenText.length > 5) {
          items.push({ name, category: 'Menu', _rawText: allergenText });
        }
      }

      // Also try getting all text from the page body for allergen scanning
      if (items.length === 0) {
        const bodyText = document.body.innerText;
        return { items: [], bodyText };
      }
      return { items, bodyText: '' };
    }).catch(() => ({ items: [], bodyText: '' }));

    if (data.items.length > 0) return data.items;
    return [];
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
      let currentCategory = 'Menu';

      for (let i = 1; i < rows.length; i++) {
        const cells = Array.from(rows[i].querySelectorAll('td, th'));
        if (!cells.length) continue;
        const firstName = (cells[0].innerText || '').trim();
        if (!firstName) continue;
        if (cells.length <= 1) { currentCategory = firstName; continue; }

        const values = cells.slice(1).map(cell => {
          const txt     = (cell.innerText || '').trim().toLowerCase();
          const hasIcon = !!(cell.querySelector('img, svg, [class*="check"], [class*="icon"]'));
          const aria    = (cell.getAttribute('aria-label') || '').toLowerCase();
          return (hasIcon || aria.includes('yes') || aria.includes('contain') ||
                  (txt && txt !== '-' && txt !== 'n/a' && txt !== 'no' && txt.length < 6))
            ? 'present' : '';
        });

        items.push({ name: firstName, category: currentCategory, _values: values });
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
    let currentCategory = 'Menu';

    for (const line of lines) {
      if (line.length < 50 && /^[A-Z][A-Z\s&]+$/.test(line)) { currentCategory = line; continue; }
      const lower = line.toLowerCase();
      if (lower.includes('contains') &&
          (lower.includes('milk') || lower.includes('wheat') || lower.includes('soy') || lower.includes('egg'))) {
        items.push({ name: line.slice(0, 80), category: currentCategory, _rawText: line });
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
      // If we got actual allergen data from the text, return it
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

    // CNV fallback for known items
    for (const a of ALLERGENS) row[a] = 'COULD_NOT_VERIFY';
    row.crossContact = 'COULD_NOT_VERIFY';
    row.confidence   = 'COULD_NOT_VERIFY';
    row.sourceText   = 'Allergen data loaded via Nutritionix iframe — not parseable in headless mode. Check tacobell.com/nutrition/allergen-info';
    return row;
  }
}

module.exports = TacoBell;
