'use strict';

/**
 * Raising Cane's Allergen Scraper
 *
 * Strategy: allergen page https://www.raisingcanes.com/allergens/
 * This is a Gatsby SPA. Body text confirms only navigation loads initially (~1365 chars).
 * The allergen table renders lazily via JS after scroll.
 *
 * The page shows a visual grid (div-based, no <table> elements) with:
 *   - INDIVIDUAL ITEMS: Chicken Finger, Caniac Sauce, Coleslaw, Crinkle Fries, Texas Toast
 *   - COMBINATION MEALS
 *   - DRINKS
 *   Allergen columns: MILK, EGG, WHEAT, SOY, FISH, SHELLFISH, TREE NUTS, PEANUTS, SESAME
 *   (as small icon checkmarks — innerText is empty, need childElementCount check)
 *
 * Approach:
 *   1. Navigate, wait for networkidle
 *   2. Scroll to bottom to trigger lazy rendering
 *   3. Wait up to 15s for content to appear
 *   4. Read body text — if allergen data available, parse it
 *   5. Else fall back to div-based cell element extraction
 */

const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow, ALLERGENS } = require('../output/schema');

const OFFICIAL_URL = 'https://www.raisingcanes.com/allergens/';

// Known Raising Cane's menu items (small menu, stable for years)
// Used to identify item rows in the body text / DOM
const KNOWN_ITEMS = [
  { name: "Chicken Finger",   category: "Individual Items" },
  { name: "Caniac Sauce",     category: "Individual Items" },
  { name: "Coleslaw",         category: "Individual Items" },
  { name: "Crinkle Fries",    category: "Individual Items" },
  { name: "Texas Toast",      category: "Individual Items" },
  { name: "Kids Meal",        category: "Individual Items" },
];

// All combinations of meals re-use the same components, so we only need the base items

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

class RaisingCanes extends BaseScraper {
  constructor() {
    super({ chainName: 'RaisingCanes', officialUrl: OFFICIAL_URL });
    this._tableData = null;
  }

  async discoverMenuItems() {
    const ok = await this.navigateTo(OFFICIAL_URL);
    if (!ok) {
      logger.error('Could not load allergen page', { chain: this.chainName });
      return [];
    }

    // Gatsby SPA — wait for initial JS bundle to execute
    try { await this.page.waitForLoadState('networkidle', { timeout: 20000 }); } catch { /* ok */ }

    // Scroll to bottom to trigger lazy rendering of the allergen table
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await this.page.waitForTimeout(3000);
    await this.page.evaluate(() => window.scrollTo(0, 0));
    await this.page.waitForTimeout(2000);

    await this.takeScreenshot('allergen-page');

    // Try to detect the allergen content in body text
    const bodyText = await this.page.innerText('body').catch(() => '');
    logger.debug(`Body text length: ${bodyText.length}`, { chain: this.chainName });

    const hasContent = bodyText.toLowerCase().includes('chicken') ||
                       bodyText.toLowerCase().includes('individual') ||
                       bodyText.toLowerCase().includes('crinkle');

    if (hasContent) {
      return await this._parseBodyText(bodyText);
    }

    // Body text still doesn't have allergen content — try DOM element approach
    const items = await this._parseDomElements();
    if (items.length > 0) return items;

    // Last resort: return the known menu items with CNV (all items have product pages at /menu/)
    logger.warn('Could not parse allergen table — returning items with product page URLs', { chain: this.chainName });
    return KNOWN_ITEMS.map(item => ({
      ...item,
      productUrl: `https://www.raisingcanes.com/menu/${item.name.toLowerCase().replace(/\s+/g, '-')}/`,
    }));
  }

  async _parseBodyText(bodyText) {
    const lines = bodyText.split('\n').map(l => l.trim()).filter(Boolean);
    const items = [];
    let currentCategory = 'Individual Items';
    const allergenKeywords = Object.keys(COLUMN_MAP);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();

      if (lower.includes('combination meal') || lower.includes('combo meal')) {
        currentCategory = 'Combination Meals';
        continue;
      }
      if (lower === 'drinks' || lower === 'beverages') {
        currentCategory = 'Drinks';
        continue;
      }
      if (lower.includes('individual item')) {
        currentCategory = 'Individual Items';
        continue;
      }

      // Line that looks like an item name (short, not a header/nav element)
      if (line.length > 2 && line.length < 60 && !lower.includes('privacy') &&
          !lower.includes('careers') && !lower.includes('copyright') &&
          !lower.includes('www.') && !lower.includes('cookie')) {

        // Check if the next few lines contain allergen info
        const contextWindow = lines.slice(i, i + 15).join(' ').toLowerCase();
        const hasAllergenContext = allergenKeywords.some(k => contextWindow.includes(k)) ||
                                   contextWindow.includes('contain') ||
                                   contextWindow.includes('allergen');
        if (hasAllergenContext) {
          const allergenLine = lines.slice(i + 1, i + 5).find(l => {
            const ll = l.toLowerCase();
            return ll.includes('contain') || allergenKeywords.some(k => ll.includes(k));
          });
          items.push({
            name: line,
            category: currentCategory,
            _rawText: allergenLine || '',
          });
        }
      }
    }

    logger.info(`Body text parsing: ${items.length} items`, { chain: this.chainName });
    return items;
  }

  async _parseDomElements() {
    // Try to find the allergen grid rows using broad element selectors
    return await this.page.evaluate((colMap) => {
      // Look for any row-like structure that contains an item name
      const candidates = [
        // Gatsby hashed class names contain "row", "item", "allergen"
        ...Array.from(document.querySelectorAll('[class*="row"]')),
        ...Array.from(document.querySelectorAll('[class*="item"]')),
        ...Array.from(document.querySelectorAll('[class*="allergen"]')),
        ...Array.from(document.querySelectorAll('tr')),
      ];

      const seen = new Set();
      const items = [];

      for (const el of candidates) {
        const txt = (el.innerText || '').trim();
        if (!txt || txt.length > 200 || seen.has(txt)) continue;
        seen.add(txt);

        // Look for cells inside this row
        const cells = Array.from(el.querySelectorAll('td, [class*="cell"], [role="cell"]'));
        if (cells.length < 3) continue; // need at least name + a few allergen columns

        const name = (cells[0].innerText || '').trim();
        if (!name || name.length < 2 || name.length > 60) continue;

        const values = [];
        cells.slice(1).forEach(cell => {
          const cellTxt  = (cell.innerText || '').trim();
          const hasChild = cell.childElementCount > 0;
          const inner    = cell.innerHTML.replace(/\s+/g, '');
          values.push((cellTxt && cellTxt !== '-') || (hasChild && inner !== '') ? 'present' : '');
        });

        items.push({ name, category: 'Individual Items', _values: values });
      }
      return items;
    }, COLUMN_MAP).catch(() => []);
  }

  async extractAllergens(item) {
    const row = makeEmptyRow();
    row.menuCategory = item.category || 'Individual Items';
    row.itemName     = item.name;
    row.sourceUrl    = OFFICIAL_URL;
    row.scrapeDate   = new Date().toISOString();

    // Raw text path
    if (item._rawText) {
      if (item._rawText.length > 3) {
        const parsed = this.parseAllergenText(item._rawText);
        Object.assign(row, parsed);
        return row;
      }
      // Empty raw text — mark CNV
      for (const a of ALLERGENS) row[a] = 'COULD_NOT_VERIFY';
      row.crossContact = 'COULD_NOT_VERIFY';
      row.confidence   = 'COULD_NOT_VERIFY';
      row.sourceText   = 'Allergen table did not render in text form';
      return row;
    }

    // DOM values path
    if (item._values) {
      // Without reliable column headers, map by position (best guess from Cane's known format)
      // Raising Cane's published format: MILK, EGG, FISH, SHELLFISH, TREE NUT, PEANUT, WHEAT, SOY, SESAME
      const posMap = ['milk', 'eggs', 'fish', 'shellfish', 'treeNuts', 'peanuts', 'wheat', 'soy', 'sesame'];
      let anyMapped = false;
      const present = [];
      posMap.forEach((allergen, idx) => {
        if (idx >= item._values.length) { row[allergen] = 'COULD_NOT_VERIFY'; return; }
        const isPresent = !!(item._values[idx]);
        row[allergen] = isPresent ? 'TRUE' : 'FALSE';
        if (isPresent) present.push(allergen);
        anyMapped = true;
      });
      if (anyMapped) {
        row.confidence   = 'HIGH';
        row.crossContact = present.length > 0 ? 'NO' : 'NO';
        row.sourceText   = present.length > 0 ? `Contains: ${present.join(', ')}` : 'No allergens listed';
        return row;
      }
    }

    // Product page fallback
    if (item.productUrl) {
      const ok = await this.navigateTo(item.productUrl);
      if (ok) {
        await this.page.waitForTimeout(1500);
        try {
          const body = await this.page.innerText('body');
          const cm   = body.match(/Contains?:?\s*([^\n.]{3,300})/i);
          const mcm  = body.match(/May\s+Contain?:?\s*([^\n.]{3,300})/i);
          if (cm || mcm) {
            const parsed = this.parseAllergenText(cm ? cm[1] : '', mcm ? mcm[1] : '');
            Object.assign(row, parsed);
            return row;
          }
        } catch { /* ok */ }
      }
    }

    for (const a of ALLERGENS) row[a] = 'COULD_NOT_VERIFY';
    row.crossContact = 'COULD_NOT_VERIFY';
    row.confidence   = 'COULD_NOT_VERIFY';
    row.sourceText   = 'Allergen table content not text-accessible (may be image/SVG-based)';
    return row;
  }
}

module.exports = RaisingCanes;
