'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class BobEvans extends BaseScraper {
  constructor() {
    super({ chainName: 'BobEvans', officialUrl: 'https://www.bobevans.com/nutrition' });
  }

  async discoverMenuItems() {
    logger.warn('BobEvans scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = BobEvans;
