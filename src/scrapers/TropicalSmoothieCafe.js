'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class TropicalSmoothieCafe extends BaseScraper {
  constructor() {
    super({ chainName: 'TropicalSmoothieCafe', officialUrl: 'https://www.tropicalsmoothiecafe.com/nutrition' });
  }

  async discoverMenuItems() {
    logger.warn('TropicalSmoothieCafe scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = TropicalSmoothieCafe;
