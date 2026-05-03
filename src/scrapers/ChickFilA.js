'use strict';

/**
 * Chick-fil-A Allergen Scraper
 *
 * Strategy: https://www.chick-fil-a.com/nutrition-allergens
 * The page has a "Nutrition | Allergens" toggle.
 * Default view = Nutrition (191 tables with macros) — useless for us.
 * After clicking the "Allergens" tab the view switches to allergen tables.
 *
 * DOM insight from inspection:
 *   - Toggle container: div.nutrition-allergens-toggle (text "Nutrition\nAllergens")
 *   - Allergen button: second button/a element inside that div, text "Allergens"
 *   - After click: tables render with allergen columns per category section
 *   - Note: "Chick-fil-A cooks in 100% refined peanut oil" — refined peanut oil
 *     is not a peanut allergen per FDA; peanuts = FALSE for all items.
 *
 * Allergen column headers expected after tab switch:
 *   Milk, Eggs, Fish, Shellfish, Tree Nuts, Peanuts, Wheat, Soy, Sesame, Gluten
 *   (some may be absent — treat missing columns as COULD_NOT_VERIFY)
 */

const BaseScraper = require('./BaseScraper');
const { logger }  = require('../utils/logger');
const { makeEmptyRow, ALLERGENS } = require('../output/schema');

const OFFICIAL_URL = 'https://www.chick-fil-a.com/nutrition-allergens';

const COLUMN_MAP = {
  'milk':          'milk',
  'dairy':         'milk',
  'egg':           'eggs',
  'eggs':          'eggs',
  'fish':          'fish',
  'shellfish':     'shellfish',
  'tree nut':      'treeNuts',
  'tree nuts':     'treeNuts',
  'peanut':        'peanuts',
  'peanuts':       'peanuts',
  'wheat':         'wheat',
  'gluten':        'wheat',
  'soy':           'soy',
  'soybean':       'soy',
  'sesame':        'sesame',
};

class ChickFilA extends BaseScraper {
  constructor() {
    super({ chainName: 'ChickFilA', officialUrl: OFFICIAL_URL });
    this._headers = null;
    this._items   = null;
  }

  async discoverMenuItems() {
    const ok = await this.navigateTo(OFFICIAL_URL);
    if (!ok) {
      logger.error('Could not load nutrition-allergens page', { chain: this.chainName });
      return [];
    }

    try { await this.page.waitForLoadState('networkidle', { timeout: 25000 }); } catch { /* ok */ }
    await this.page.waitForTimeout(2000);

    // Click "Allergens" tab to switch the view
    const clicked = await this._clickAllergenTab();
    if (clicked) {
      // Wait for the allergen tables to render after tab switch
      try { await this.page.waitForTimeout(3000); } catch { /* ok */ }
    }
    await this.takeScreenshot('allergens-view');

    const items = await this._parseAllergenTables();
    if (items.length === 0) {
      // Fallback: body text scan
      return await this._parseBodyText();
    }

    logger.info(`Discovered ${items.length} items`, { chain: this.chainName });
    this._items = items;
    return items;
  }

  async _clickAllergenTab() {
    // Use Playwright locators (not page.$) for text-based selection
    const strategies = [
      // Modern Playwright: locator with has-text
      async () => {
        const loc = this.page.locator('button:has-text("Allergens"), a:has-text("Allergens"), [role="tab"]:has-text("Allergens")').first();
        const count = await loc.count();
        if (count > 0) { await loc.click({ timeout: 5000 }); return true; }
        return false;
      },
      // Try radio/input with label "Allergens"
      async () => {
        const loc = this.page.locator('label:has-text("Allergens"), [aria-label="Allergens"]').first();
        const count = await loc.count();
        if (count > 0) { await loc.click({ timeout: 5000 }); return true; }
        return false;
      },
      // Enumerate all buttons and match text
      async () => {
        const btns = await this.page.$$('button, [role="tab"], [role="button"], a');
        for (const btn of btns) {
          const txt = (await btn.innerText().catch(() => '')).trim();
          if (txt === 'Allergens') { await btn.click(); return true; }
        }
        return false;
      },
    ];

    for (const strategy of strategies) {
      try {
        const clicked = await strategy();
        if (clicked) {
          logger.info('Clicked Allergens tab', { chain: this.chainName });
          return true;
        }
      } catch { /* try next */ }
    }
    logger.warn('Could not click Allergens tab — reading page as-is', { chain: this.chainName });
    return false;
  }

  async _parseAllergenTables() {
    // Chick-fil-A's allergen view uses accordion rows where each row's first cell contains:
    //   "Click to view all the\n{ItemName}\noptions.\n{ItemName}\n\tContains Milk\n\tContains Egg..."
    // The allergen data is embedded in the item text, not in separate columns.
    //
    // Strategy: read body text and parse "Contains X" / "Does not contain X" patterns.
    const body = await this.page.innerText('body').catch(() => '');
    return this._parseAllergenBodyText(body);
  }

  _parseAllergenBodyText(body) {
    const ALLERGEN_MAP = {
      'milk':       'milk',
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

    // Chick-fil-A body text pattern (allergen view):
    //   Contains Milk
    //   Contains Egg
    //   Does not contain Fish
    //   ... (repeating for each allergen)
    //   {ItemName}          ← item name appears isolated, before or after allergen lines
    //
    // Detect blocks: an item name line followed by a cluster of "Contains/Does not contain" lines.
    const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
    const results = [];
    const seenNames = new Set();

    const UI_SKIP = /^(nutrition|allergens?|calories|serving|fat|sodium|protein|fiber|sugar|carb|cholesterol|trans|saturated|click to|options\.|menu|order|sign in|careers|privacy|locations|find a|gift card|contains |does not contain )/i;

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // Skip UI/nav lines
      if (UI_SKIP.test(line) || line.length > 80 || line.length < 2) { i++; continue; }

      // Look ahead: check if within next 20 lines we see "Contains X" patterns
      const windowLines = lines.slice(i + 1, i + 25);
      const windowText  = windowLines.join('\n').toLowerCase();
      const hasAllergens = /\bcontains\s+(milk|egg|wheat|soy|fish|shellfish|peanut|sesame|tree nut)/i.test(windowText) ||
                           /does not contain/i.test(windowText);

      if (!hasAllergens) { i++; continue; }

      // This line looks like an item name — collect allergen lines that follow
      const name = line;
      if (seenNames.has(name)) { i++; continue; }

      const allergens = {};
      let j = i + 1;
      while (j < Math.min(i + 25, lines.length)) {
        const l = lines[j].trim();
        const ll = l.toLowerCase();

        if (/^does not contain\s+/i.test(l)) {
          const ingredient = l.replace(/^does not contain\s+/i, '').toLowerCase().trim();
          for (const [key, field] of Object.entries(ALLERGEN_MAP)) {
            if (ingredient.includes(key)) { allergens[field] = 'FALSE'; break; }
          }
          j++;
        } else if (/^contains\s+/i.test(l) && !/^contains:/i.test(l)) {
          const ingredient = l.replace(/^contains\s+/i, '').toLowerCase().trim();
          for (const [key, field] of Object.entries(ALLERGEN_MAP)) {
            if (ingredient.includes(key)) { allergens[field] = 'TRUE'; break; }
          }
          j++;
        } else if (ll === '' || UI_SKIP.test(l)) {
          j++; // skip blank/nav lines between allergen entries
        } else {
          break; // non-allergen, non-skip line = new item starts
        }
      }

      if (Object.keys(allergens).length >= 4) {
        seenNames.add(name);
        results.push({ name, category: 'Menu', _allergenMap: allergens });
        i = j;
      } else {
        i++;
      }
    }

    logger.info(`Allergen body text parsing: ${results.length} items`, { chain: this.chainName });
    return results;
  }

  async _parseBodyText() {
    const body = await this.page.innerText('body').catch(() => '');
    const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
    const items = [];
    let currentCategory = 'Menu';

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (line.length < 40 && /^[A-Z\s&]+$/.test(line)) { currentCategory = line; continue; }
      if (lower.includes('contains') && (lower.includes('milk') || lower.includes('wheat') || lower.includes('soy'))) {
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
      return row;
    }

    // Allergen map from body text parsing ("Contains X" / "Does not contain X")
    if (item._allergenMap) {
      const present = [];
      for (const a of ALLERGENS) {
        const val = item._allergenMap[a];
        row[a] = val || 'COULD_NOT_VERIFY';
        if (val === 'TRUE') present.push(a);
      }
      row.confidence   = 'HIGH';
      row.crossContact = 'NO';
      row.sourceText   = present.length > 0
        ? `Contains: ${present.join(', ')}`
        : 'No allergens listed (per Chick-fil-A allergen guide)';
      return row;
    }

    return this.buildCNVRow(item.category, item.name, OFFICIAL_URL, 'No allergen data found');
  }
}

module.exports = ChickFilA;
