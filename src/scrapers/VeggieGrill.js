'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class VeggieGrill extends BaseScraper {
  constructor() {
    super({ chainName: 'VeggieGrill', officialUrl: 'https://www.veggiegrill.com/menu' });
  }

  async discoverMenuItems() {
    logger.warn('VeggieGrill scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = VeggieGrill;
