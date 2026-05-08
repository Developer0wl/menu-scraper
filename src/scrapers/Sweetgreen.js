'use strict';

const HybridScraper = require('./HybridScraper');
const { logger }    = require('../utils/logger');
const { makeEmptyRow, ALLERGENS } = require('../output/schema');

const OFFICIAL_URL = 'https://www.sweetgreen.com/menu';

class Sweetgreen extends HybridScraper {
  constructor() {
    super({ chainName: 'Sweetgreen', officialUrl: OFFICIAL_URL });
  }

  async _discoverViaAPI() {
    const ok = await this.navigateTo(OFFICIAL_URL);
    if (!ok) return null;

    try { await this.page.waitForLoadState('networkidle', { timeout: 20000 }); } catch { /* ok */ }

    const json = await this.waitForApiResponse(/api\.sweetgreen\.com\/|sweetgreen\.com\/api\//, 20000);
    if (!json) {
      logger.warn('No Sweetgreen API response intercepted', { chain: this.chainName });
      return null;
    }

    const items = json.products || json.items || json.data || [];
    return items.map(item => ({
      name:    item.name || item.title || 'Unknown',
      category: item.category?.name || item.menuCategory || 'Menu',
      _sgData:  item.allergens || item.dietaryAttributes || null,
    }));
  }

  async extractAllergens(item) {
    const row = makeEmptyRow();
    row.menuCategory = item.category;
    row.itemName     = item.name;
    row.sourceUrl    = OFFICIAL_URL;
    row.scrapeDate   = new Date().toISOString();

    if (!item._sgData) {
      for (const a of ALLERGENS) row[a] = 'COULD_NOT_VERIFY';
      row.crossContact = 'COULD_NOT_VERIFY';
      row.confidence   = 'COULD_NOT_VERIFY';
      row.sourceText   = 'No allergen API data';
      return row;
    }

    // Normalize: _sgData may be a string ("Contains: Milk, Wheat") or
    // an object with boolean/string flags — handle both after first live run confirms shape
    const allergenText = typeof item._sgData === 'string'
      ? item._sgData
      : JSON.stringify(item._sgData);
    Object.assign(row, this.parseAllergenText(allergenText));
    return row;
  }
}

module.exports = Sweetgreen;
