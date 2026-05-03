'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class Smashburger extends BaseScraper {
  constructor() {
    super({ chainName: 'Smashburger', officialUrl: 'https://smashburger.com/nutrition' });
  }

  async discoverMenuItems() {
    logger.warn('Smashburger scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = Smashburger;
