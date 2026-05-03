'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class RoundTablePizza extends BaseScraper {
  constructor() {
    super({ chainName: 'RoundTablePizza', officialUrl: 'https://roundtablepizza.com/nutrition' });
  }

  async discoverMenuItems() {
    logger.warn('RoundTablePizza scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = RoundTablePizza;
