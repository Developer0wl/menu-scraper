'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class YardHouse extends BaseScraper {
  constructor() {
    super({ chainName: 'YardHouse', officialUrl: 'https://www.yardhouse.com/nutrition' });
  }

  async discoverMenuItems() {
    logger.warn('YardHouse scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = YardHouse;
