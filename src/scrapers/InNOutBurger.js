'use strict';

/**
 * In-N-Out Burger Allergen Scraper
 *
 * In-N-Out's allergen data is only published as a downloadable PDF guide.
 * Their website (SPA) does not expose per-item allergen data in HTML form.
 * Category pages render via React but item URLs contain no allergen sections.
 *
 * Strategy:
 *   1. Visit /menu/nutrition-info — try to find allergen data or parse items
 *   2. Visit each item product page and scan for "Contains:" text
 *   3. If no allergen text found, mark as COULD_NOT_VERIFY with PDF note
 *
 * Known menu is small and stable (~20 items).
 */

const BaseScraper = require('./BaseScraper');
const Bottleneck  = require('bottleneck');
const { logger }  = require('../utils/logger');
const { makeEmptyRow, ALLERGENS } = require('../output/schema');

const OFFICIAL_URL    = 'https://www.in-n-out.com/menu/nutrition-info';
const ALLERGEN_PDF    = 'https://www.in-n-out.com/docs/nutritional_info.pdf';

// In-N-Out menu is famously small and hasn't changed in decades
const KNOWN_ITEMS = [
  { name: 'Hamburger',                category: 'Burgers',    productUrl: 'https://www.in-n-out.com/menu/burgers' },
  { name: 'Cheeseburger',             category: 'Burgers',    productUrl: 'https://www.in-n-out.com/menu/burgers' },
  { name: 'Double-Double',            category: 'Burgers',    productUrl: 'https://www.in-n-out.com/menu/burgers' },
  { name: 'French Fries',             category: 'Fries',      productUrl: 'https://www.in-n-out.com/menu/fries' },
  { name: 'Chocolate Shake',          category: 'Shakes',     productUrl: 'https://www.in-n-out.com/menu/shakes' },
  { name: 'Vanilla Shake',            category: 'Shakes',     productUrl: 'https://www.in-n-out.com/menu/shakes' },
  { name: 'Strawberry Shake',         category: 'Shakes',     productUrl: 'https://www.in-n-out.com/menu/shakes' },
  { name: 'Coffee',                   category: 'Beverages',  productUrl: 'https://www.in-n-out.com/menu/drinks' },
  { name: 'Hot Cocoa',                category: 'Beverages',  productUrl: 'https://www.in-n-out.com/menu/drinks' },
  { name: 'Lemonade',                 category: 'Beverages',  productUrl: 'https://www.in-n-out.com/menu/drinks' },
  { name: 'Iced Tea',                 category: 'Beverages',  productUrl: 'https://www.in-n-out.com/menu/drinks' },
  { name: 'Pink Lemonade',            category: 'Beverages',  productUrl: 'https://www.in-n-out.com/menu/drinks' },
  { name: 'Milk',                     category: 'Beverages',  productUrl: 'https://www.in-n-out.com/menu/drinks' },
  { name: 'Root Beer Float',          category: 'Beverages',  productUrl: 'https://www.in-n-out.com/menu/drinks' },
  { name: 'Spread',                   category: 'Condiments', productUrl: null },
  { name: 'Ketchup',                  category: 'Condiments', productUrl: null },
  { name: 'Mustard',                  category: 'Condiments', productUrl: null },
  { name: 'Onions (raw)',             category: 'Condiments', productUrl: null },
  { name: 'Chiles (whole)',           category: 'Condiments', productUrl: null },
  { name: 'Cheese',                   category: 'Condiments', productUrl: null },
];

class InNOutBurger extends BaseScraper {
  constructor() {
    super({ chainName: 'InNOutBurger', officialUrl: OFFICIAL_URL });
    this._limiter = new Bottleneck({ minTime: 2500, maxConcurrent: 1 });
  }

  async discoverMenuItems() {
    // Try to find allergen data on each item's product page
    // Return the known items list — SPA pages don't expose allergen tables in HTML
    logger.info(`Using known item list (${KNOWN_ITEMS.length} items) — allergen data from product pages`, { chain: this.chainName });
    return KNOWN_ITEMS;
  }

  async scrape() {
    logger.info('Starting scrape', { chain: this.chainName });
    this.results = [];
    this.errors  = [];

    const items = await this.discoverMenuItems();
    this._discoveredCount = items.length;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      logger.info(`[${i + 1}/${items.length}] ${item.name}`, { chain: this.chainName });

      let row;
      try {
        row = await this._limiter.schedule(() => this.extractAllergens(item));
        if (!row) row = this.buildCNVRow(item.category, item.name, OFFICIAL_URL, 'null returned');
      } catch (err) {
        row = this.buildCNVRow(item.category, item.name, OFFICIAL_URL, `Exception: ${err.message}`);
      }

      row.rowNum = this.results.length + 1;
      this.validateRow(row);
      this.results.push(row);
    }

    logger.info(`Scrape complete — ${this.results.length} rows`, { chain: this.chainName });
    return this.results;
  }

  async extractAllergens(item) {
    const row = makeEmptyRow();
    row.menuCategory = item.category;
    row.itemName     = item.name;
    row.sourceUrl    = item.productUrl || OFFICIAL_URL;
    row.scrapeDate   = new Date().toISOString();

    // Condiments have no product page — mark CNV
    if (!item.productUrl) {
      for (const a of ALLERGENS) row[a] = 'COULD_NOT_VERIFY';
      row.crossContact = 'COULD_NOT_VERIFY';
      row.confidence   = 'COULD_NOT_VERIFY';
      row.sourceText   = `Allergen data only in PDF guide: ${ALLERGEN_PDF}`;
      return row;
    }

    const ok = await this.navigateTo(item.productUrl);
    if (!ok) return this.buildCNVRow(item.category, item.name, item.productUrl, 'Page load failed');

    try { await this.page.waitForLoadState('networkidle', { timeout: 15000 }); } catch { /* ok */ }
    await this.page.waitForTimeout(2000);

    // Scroll to trigger any lazy content
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await this.page.waitForTimeout(1500);

    try {
      const body = await this.page.innerText('body');

      // Look for "Contains:" or "May Contain:" patterns
      const cm  = body.match(/Contains?:?\s*([^\n.]{3,300})/i);
      const mcm = body.match(/May\s+Contain?:?\s*([^\n.]{3,300})/i);

      if (cm || mcm) {
        const parsed = this.parseAllergenText(cm ? cm[1] : '', mcm ? mcm[1] : '');
        Object.assign(row, parsed);
        return row;
      }

      // Check for allergen section keywords
      const lower = body.toLowerCase();
      if (lower.includes('allergen') || lower.includes('milk') || lower.includes('wheat')) {
        // Look for structured allergen data
        const allergenMatch = body.match(/allergen[s]?[:\s]+([^\n]{10,200})/i);
        if (allergenMatch) {
          const parsed = this.parseAllergenText(allergenMatch[1]);
          Object.assign(row, parsed);
          return row;
        }
      }
    } catch { /* ok */ }

    // No allergen data found — mark CNV
    for (const a of ALLERGENS) row[a] = 'COULD_NOT_VERIFY';
    row.crossContact = 'COULD_NOT_VERIFY';
    row.confidence   = 'COULD_NOT_VERIFY';
    row.sourceText   = `Allergen data not found on product page. PDF guide: ${ALLERGEN_PDF}`;
    return row;
  }
}

module.exports = InNOutBurger;
