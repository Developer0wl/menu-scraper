'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');

class Whataburger extends BaseScraper {
  constructor() {
    super({ chainName: 'Whataburger', officialUrl: 'https://whataburger.com/food/allergens' });
  }
  async discoverMenuItems() {
    logger.warn('Whataburger scraper not yet implemented', { chain: this.chainName });
    return [];
  }
  async extractAllergens() { return null; }
}
module.exports = Whataburger;
