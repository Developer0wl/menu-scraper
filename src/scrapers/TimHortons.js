'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

class TimHortons extends BaseScraper {
  constructor() {
    super({ chainName: 'TimHortons', officialUrl: 'https://www.timhortons.com/us/en/menu/nutrition.html' });
  }

  async discoverMenuItems() {
    logger.warn('TimHortons scraper not yet implemented — stub', { chain: this.chainName });
    return [];
  }

  async extractAllergens(item) {
    return this.buildCNVRow(item.category, item.name, this.officialUrl, 'Scraper not yet implemented');
  }
}

module.exports = TimHortons;
