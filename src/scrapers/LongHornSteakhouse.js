'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');

class LongHornSteakhouse extends BaseScraper {
  constructor() {
    super({ chainName: 'LongHornSteakhouse', officialUrl: 'https://www.longhornsteakhouse.com/full-menu' });
  }
  async discoverMenuItems() {
    logger.warn('LongHornSteakhouse scraper not yet implemented', { chain: this.chainName });
    return [];
  }
  async extractAllergens() { return null; }
}
module.exports = LongHornSteakhouse;
