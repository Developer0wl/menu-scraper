'use strict';

const HybridScraper = require('./HybridScraper');
const { logger }    = require('../utils/logger');
const { makeEmptyRow, ALLERGENS } = require('../output/schema');

const OFFICIAL_URL = 'https://www.qdoba.com/nutrition';

class Qdoba extends HybridScraper {
  constructor() {
    super({ chainName: 'Qdoba', officialUrl: OFFICIAL_URL });
  }

  async _discoverViaAPI() {
    const ok = await this.navigateTo(OFFICIAL_URL);
    if (!ok) {
      logger.warn('Qdoba page blocked or unreachable', { chain: this.chainName });
      return null;
    }

    try { await this.page.waitForLoadState('networkidle', { timeout: 30000 }); } catch { /* ok */ }

    const json = await this.waitForApiResponse(
      /nutritionix\.com|qdoba\.com\/api|cdn\.qdoba/, 25000
    );
    if (!json) {
      logger.warn('Qdoba: no API response intercepted (Cloudflare likely blocking)', { chain: this.chainName });
      return null;
    }

    const items = json.products || json.items || json.data?.menuItems || [];
    return items.map(item => ({
      name:     item.name || item.item_name || 'Unknown',
      category: item.category?.name || 'Menu',
      _qData:   item,
    }));
  }

  async extractAllergens(item) {
    const row = makeEmptyRow();
    row.menuCategory = item.category;
    row.itemName     = item.name;
    row.sourceUrl    = OFFICIAL_URL;
    row.scrapeDate   = new Date().toISOString();

    if (!item._qData) {
      for (const a of ALLERGENS) row[a] = 'COULD_NOT_VERIFY';
      row.crossContact = 'COULD_NOT_VERIFY';
      row.confidence   = 'COULD_NOT_VERIFY';
      row.sourceText   = 'No API data';
      return row;
    }

    // Parse based on actual API shape discovered at runtime
    const allergenText = JSON.stringify(item._qData.allergens || item._qData);
    Object.assign(row, this.parseAllergenText(allergenText));
    return row;
  }
}

module.exports = Qdoba;
