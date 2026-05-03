'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class WaffleHouse extends BaseScraper {
  constructor() {
    super({ chainName: 'WaffleHouse', officialUrl: 'https://www.wafflehouse.com/nutrition' });
  }

  async discoverMenuItems() {
    logger.warn('WaffleHouse scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = WaffleHouse;
