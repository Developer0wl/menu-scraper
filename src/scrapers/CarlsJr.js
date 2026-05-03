'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class CarlsJr extends BaseScraper {
  constructor() {
    super({ chainName: 'CarlsJr', officialUrl: 'https://www.carlsjr.com/nutrition' });
  }

  async discoverMenuItems() {
    logger.warn('CarlsJr scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = CarlsJr;
