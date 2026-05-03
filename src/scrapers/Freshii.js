'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class Freshii extends BaseScraper {
  constructor() {
    super({ chainName: 'Freshii', officialUrl: 'https://www.freshii.com/nutrition' });
  }

  async discoverMenuItems() {
    logger.warn('Freshii scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = Freshii;
