'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class SteakNShake extends BaseScraper {
  constructor() {
    super({ chainName: 'SteakNShake', officialUrl: 'https://www.steaknshake.com/nutrition' });
  }

  async discoverMenuItems() {
    logger.warn('SteakNShake scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = SteakNShake;
