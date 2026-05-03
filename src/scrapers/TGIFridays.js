'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class TGIFridays extends BaseScraper {
  constructor() {
    super({ chainName: 'TGIFridays', officialUrl: 'https://www.tgifridays.com/menu/nutrition' });
  }

  async discoverMenuItems() {
    logger.warn('TGIFridays scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = TGIFridays;
