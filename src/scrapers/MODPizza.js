'use strict';

const HybridScraper = require('./HybridScraper');
const { logger }    = require('../utils/logger');
const { makeEmptyRow, ALLERGENS } = require('../output/schema');

const ALLERGEN_URL = 'https://modpizza.com/allergen/';
const OFFICIAL_URL = 'https://modpizza.com/nutrition';

// Column order matches the allergen-cell divs left-to-right on the page
const ALLERGEN_ORDER = ['milk', 'eggs', 'wheat', 'shellfish', 'fish', 'soy', 'peanuts', 'treeNuts', 'sesame'];

class MODPizza extends HybridScraper {
  constructor() {
    super({ chainName: 'MODPizza', officialUrl: OFFICIAL_URL });
  }

  async _discoverViaAPI() {
    const ok = await this.navigateTo(ALLERGEN_URL);
    if (!ok) {
      logger.warn('MOD Pizza allergen page unreachable', { chain: this.chainName });
      return null;
    }

    try { await this.page.waitForLoadState('networkidle', { timeout: 15000 }); } catch { /* ok */ }

    const items = await this.page.evaluate(() => {
      const results = [];
      document.querySelectorAll('.card').forEach(card => {
        const h3 = card.querySelector('h3');
        const category = h3 ? h3.textContent.trim() : 'Menu';

        card.querySelectorAll('.menu-item').forEach(itemEl => {
          const nameEl = itemEl.querySelector('.menu-item__name strong');
          if (!nameEl) return;
          const name = nameEl.getAttribute('aria-label') || nameEl.textContent.trim();
          if (!name) return;

          // Each .allergen-cell: has a .contains child = allergen present
          const cells = Array.from(itemEl.querySelectorAll('.warnings .allergen-cell'));
          const allergens = cells.map(cell => !!cell.querySelector('.contains'));

          results.push({ name, category, allergens });
        });
      });
      return results;
    });

    if (!items || items.length === 0) {
      logger.warn('No items extracted from MOD Pizza HTML', { chain: this.chainName });
      return null;
    }

    logger.info(`MOD Pizza HTML: extracted ${items.length} items`, { chain: this.chainName });
    return items;
  }

  async extractAllergens(item) {
    const row = makeEmptyRow();
    row.menuCategory = item.category;
    row.itemName     = item.name;
    row.sourceUrl    = ALLERGEN_URL;
    row.scrapeDate   = new Date().toISOString();

    if (!item.allergens || item.allergens.length !== 9) {
      for (const a of ALLERGENS) row[a] = 'COULD_NOT_VERIFY';
      row.confidence = 'COULD_NOT_VERIFY';
      row.sourceText = 'HTML allergen cells not found';
      return row;
    }

    const present = [];
    ALLERGEN_ORDER.forEach((a, i) => {
      row[a] = item.allergens[i] ? 'TRUE' : 'FALSE';
      if (item.allergens[i]) present.push(a);
    });

    row.crossContact = 'YES'; // MOD Pizza discloses shared equipment site-wide
    row.confidence   = 'HIGH';
    row.sourceText   = present.length > 0
      ? `Contains: ${present.join(', ')}`
      : 'No allergens indicated';
    return row;
  }
}

module.exports = MODPizza;
