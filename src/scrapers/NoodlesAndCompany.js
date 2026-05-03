'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class NoodlesAndCompany extends BaseScraper {
  constructor() {
    super({ chainName: 'NoodlesAndCompany', officialUrl: 'https://www.noodles.com/nutrition' });
  }

  async discoverMenuItems() {
    logger.warn('NoodlesAndCompany scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = NoodlesAndCompany;
