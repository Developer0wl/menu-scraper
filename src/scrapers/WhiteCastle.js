'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class WhiteCastle extends BaseScraper {
  constructor() {
    super({ chainName: 'WhiteCastle', officialUrl: 'https://www.whitecastle.com/menu/nutrition' });
  }

  async discoverMenuItems() {
    logger.warn('WhiteCastle scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = WhiteCastle;
