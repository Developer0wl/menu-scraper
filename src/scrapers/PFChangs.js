'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class PFChangs extends BaseScraper {
  constructor() {
    super({ chainName: 'PFChangs', officialUrl: 'https://www.pfchangs.com/nutrition' });
  }

  async discoverMenuItems() {
    logger.warn('PFChangs scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = PFChangs;
