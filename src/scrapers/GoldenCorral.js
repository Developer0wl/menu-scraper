'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class GoldenCorral extends BaseScraper {
  constructor() {
    super({ chainName: 'GoldenCorral', officialUrl: 'https://www.goldencorral.com/nutrition' });
  }

  async discoverMenuItems() {
    logger.warn('GoldenCorral scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = GoldenCorral;
