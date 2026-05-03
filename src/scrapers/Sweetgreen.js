'use strict';

const BaseScraper = require('./BaseScraper');
const { logger }  = require('../utils/logger');
const { makeEmptyRow, ALLERGENS } = require('../output/schema');

const OFFICIAL_URL = 'https://www.sweetgreen.com/menu';

const KNOWN_ITEMS = [
  { name: 'Harvest Bowl', category: 'Bowls' },
  { name: 'Crispy Rice Bowl', category: 'Bowls' },
  { name: 'Shroomami', category: 'Bowls' },
  { name: 'Hot Honey Chicken', category: 'Bowls' },
  { name: 'Super Green Goddess', category: 'Bowls' },
  { name: 'Buffalo Chicken Bowl', category: 'Bowls' },
  { name: 'Chicken Pesto Parm', category: 'Bowls' },
  { name: 'Kale Caesar', category: 'Salads' },
  { name: 'Garden Cobb', category: 'Salads' },
  { name: 'Guacamole Greens', category: 'Salads' },
  { name: 'Caesar', category: 'Salads' },
  { name: 'Miso Glazed Salmon Bowl', category: 'Plates' },
  { name: 'Blackened Chicken Plate', category: 'Plates' },
  { name: 'Caramelized Garlic Steak Plate', category: 'Plates' },
  { name: 'Ripple Fries', category: 'Sides' },
  { name: 'Focaccia', category: 'Sides' },
  { name: 'Sweetgreen Cookie', category: 'Sides' },
];

class Sweetgreen extends BaseScraper {
  constructor() {
    super({ chainName: 'Sweetgreen', officialUrl: OFFICIAL_URL });
  }

  async discoverMenuItems() {
    const ok = await this.navigateTo(OFFICIAL_URL);
    if (!ok) return KNOWN_ITEMS;

    try { await this.page.waitForLoadState('networkidle', { timeout: 25000 }); } catch { /* ok */ }
    await this.page.waitForTimeout(3000);
    await this.takeScreenshot('menu-page');

    // Parse menu item cards
    const items = await this.page.evaluate(() => {
      const results = [];
      const cards = document.querySelectorAll('[class*="menu-item"], [class*="product"], article, .card, [data-testid*="menu"]');
      for (const card of cards) {
        const nameEl = card.querySelector('h2, h3, h4, .name, .title, [class*="name"]');
        const name = nameEl ? nameEl.innerText.trim() : '';
        if (!name || name.length < 2 || name.length > 80) continue;
        const text = card.innerText || '';
        results.push({ name, category: 'Menu', _rawText: text });
      }
      return results;
    }).catch(() => []);

    if (items.length > 0) {
      logger.info(`Menu parse: ${items.length} items`, { chain: this.chainName });
      return items;
    }

    // Body text
    const body = await this.page.innerText('body').catch(() => '');
    const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
    const bodyItems = []; const seen = new Set();
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.includes('contains') && (lower.includes('milk') || lower.includes('wheat') || lower.includes('soy'))) {
        const name = line.slice(0, 80);
        if (!seen.has(name)) { seen.add(name); bodyItems.push({ name, category: 'Menu', _rawText: line }); }
      }
    }
    if (bodyItems.length > 0) return bodyItems;

    logger.warn(`Falling back to ${KNOWN_ITEMS.length} known items`, { chain: this.chainName });
    return KNOWN_ITEMS;
  }

  async extractAllergens(item) {
    const row = makeEmptyRow();
    row.menuCategory = item.category;
    row.itemName = item.name;
    row.sourceUrl = OFFICIAL_URL;
    row.scrapeDate = new Date().toISOString();

    if (item._rawText) {
      const parsed = this.parseAllergenText(item._rawText);
      Object.assign(row, parsed);
      const hasAny = ALLERGENS.some(a => row[a] === 'TRUE');
      if (hasAny) return row;
    }

    for (const a of ALLERGENS) row[a] = 'COULD_NOT_VERIFY';
    row.crossContact = 'COULD_NOT_VERIFY'; row.confidence = 'COULD_NOT_VERIFY';
    row.sourceText = 'Check sweetgreen.com/menu for allergen details';
    return row;
  }
}

module.exports = Sweetgreen;
