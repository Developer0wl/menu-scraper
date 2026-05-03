'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class TexasRoadhouse extends BaseScraper {
  constructor() {
    super({ chainName: 'TexasRoadhouse', officialUrl: 'https://www.texasroadhouse.com/menu-items/nutritional-information' });
  }

  async discoverMenuItems() {
    logger.warn('TexasRoadhouse scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = TexasRoadhouse;
