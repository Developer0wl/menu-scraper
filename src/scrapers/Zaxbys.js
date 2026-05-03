'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class Zaxbys extends BaseScraper {
  constructor() {
    super({ chainName: 'Zaxbys', officialUrl: 'https://www.zaxbys.com/nutrition' });
  }

  async discoverMenuItems() {
    logger.warn('Zaxbys scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = Zaxbys;
