'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class JustSalad extends BaseScraper {
  constructor() {
    super({ chainName: 'JustSalad', officialUrl: 'https://www.justsalad.com/nutrition' });
  }

  async discoverMenuItems() {
    logger.warn('JustSalad scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = JustSalad;
