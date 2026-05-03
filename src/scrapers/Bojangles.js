'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class Bojangles extends BaseScraper {
  constructor() {
    super({ chainName: 'Bojangles', officialUrl: 'https://www.bojangles.com/menu/nutritional-info' });
  }

  async discoverMenuItems() {
    logger.warn('Bojangles scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = Bojangles;
