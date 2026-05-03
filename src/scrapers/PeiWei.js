'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class PeiWei extends BaseScraper {
  constructor() {
    super({ chainName: 'PeiWei', officialUrl: 'https://www.peiwei.com/nutrition' });
  }

  async discoverMenuItems() {
    logger.warn('PeiWei scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = PeiWei;
