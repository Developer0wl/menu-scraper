'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class MODPizza extends BaseScraper {
  constructor() {
    super({ chainName: 'MODPizza', officialUrl: 'https://www.modpizza.com/menu/nutrition' });
  }

  async discoverMenuItems() {
    logger.warn('MODPizza scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = MODPizza;
