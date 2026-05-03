'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class MoesSouthwestGrill extends BaseScraper {
  constructor() {
    super({ chainName: 'MoesSouthwestGrill', officialUrl: 'https://www.moes.com/nutrition' });
  }

  async discoverMenuItems() {
    logger.warn('MoesSouthwestGrill scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = MoesSouthwestGrill;
