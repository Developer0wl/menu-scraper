'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class BlazePizza extends BaseScraper {
  constructor() {
    super({ chainName: 'BlazePizza', officialUrl: 'https://blazepizza.com/nutrition' });
  }

  async discoverMenuItems() {
    logger.warn('BlazePizza scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = BlazePizza;
