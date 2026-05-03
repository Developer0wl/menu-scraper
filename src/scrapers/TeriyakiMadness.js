'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class TeriyakiMadness extends BaseScraper {
  constructor() {
    super({ chainName: 'TeriyakiMadness', officialUrl: 'https://www.teriyakimadness.com/nutrition' });
  }

  async discoverMenuItems() {
    logger.warn('TeriyakiMadness scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = TeriyakiMadness;
