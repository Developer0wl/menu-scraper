'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class CAVA extends BaseScraper {
  constructor() {
    super({ chainName: 'CAVA', officialUrl: 'https://cava.com/nutrition' });
  }

  async discoverMenuItems() {
    logger.warn('CAVA scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = CAVA;
