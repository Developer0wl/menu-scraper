'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class BJsRestaurants extends BaseScraper {
  constructor() {
    super({ chainName: 'BJsRestaurants', officialUrl: 'https://www.bjsrestaurants.com/menu/nutrition' });
  }

  async discoverMenuItems() {
    logger.warn('BJsRestaurants scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = BJsRestaurants;
