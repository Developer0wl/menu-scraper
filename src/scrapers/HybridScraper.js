'use strict';

const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow } = require('../output/schema');

/**
 * HybridScraper
 * 
 * An extension of BaseScraper that prioritizes fetching data via internal APIs
 * or third-party JSON endpoints before falling back to DOM scraping.
 */
class HybridScraper extends BaseScraper {
  constructor(options) {
    super(options);
  }

  async discoverMenuItems() {
    logger.info(`Attempting API discovery first`, { chain: this.chainName });
    const apiItems = await this._discoverViaAPI();
    
    if (apiItems && apiItems.length > 0) {
      logger.info(`API discovery succeeded: ${apiItems.length} items`, { chain: this.chainName });
      return apiItems;
    }

    logger.warn(`API discovery failed or returned empty. Falling back to DOM scraping.`, { chain: this.chainName });
    return await this._discoverViaScraping();
  }

  /**
   * Must be implemented by subclasses to define the API discovery logic.
   * Return an array of menu item objects.
   */
  async _discoverViaAPI() {
    return [];
  }

  /**
   * Optional fallback for DOM scraping. 
   * By default, it will just throw if not implemented, as most Hybrid scrapers
   * should rely exclusively on their API.
   */
  async _discoverViaScraping() {
    throw new Error(`${this.chainName}._discoverViaScraping() not implemented`);
  }
}

module.exports = HybridScraper;
