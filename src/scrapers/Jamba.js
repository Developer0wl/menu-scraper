'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class Jamba extends BaseScraper {
  constructor() {
    super({ chainName: 'Jamba', officialUrl: 'https://www.jamba.com/nutrition' });
  }

  async discoverMenuItems() {
    logger.warn('Jamba scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = Jamba;
