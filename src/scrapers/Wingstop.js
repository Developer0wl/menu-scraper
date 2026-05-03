'use strict';

/**
 * Wingstop Allergen Scraper
 *
 * The /allergens page has a "CLICK HERE TO VIEW OUR ALLERGEN MENU" button
 * that opens a PDF file hosted on Bynder CDN (cdn.bfldr.com). There is no
 * HTML allergen table accessible via browser automation.
 *
 * Strategy: use a hardcoded known-items list and mark all CNV with PDF reference.
 * Each wing item type (Bone-in, Boneless, Tenders) is listed for each flavor.
 * Allergen data from the PDF can be manually loaded if needed.
 */

const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow, ALLERGENS } = require('../output/schema');

const OFFICIAL_URL  = 'https://www.wingstop.com/allergens';
const ALLERGEN_PDF  = 'https://cdn.bfldr.com/NDQASMJ1/as/2v4qqb9ww8mvcm64gnh7ktnc/WS_Allergens_1226_2';

// Wingstop core menu items (flavors × item types are the primary structure)
const WING_FLAVORS = [
  'Original Hot', 'Mild', 'Cajun', 'Lemon Pepper', 'Garlic Parmesan',
  'Atomic', 'Hawaiian', 'Mango Habanero', 'Louisiana Rub', 'Hickory Smoked BBQ',
  'Spicy Korean Q', 'Bayou BBQ', 'Thin & Crispy Original', 'Thin & Crispy Garlic Parmesan',
];

const KNOWN_ITEMS = [
  // Wings
  ...WING_FLAVORS.map(f => ({ name: `Bone-in Wings – ${f}`, category: 'Bone-in Wings' })),
  ...WING_FLAVORS.map(f => ({ name: `Boneless Wings – ${f}`, category: 'Boneless Wings' })),
  ...WING_FLAVORS.map(f => ({ name: `Crispy Tenders – ${f}`, category: 'Tenders' })),
  // Sides
  { name: 'Seasoned Fries',            category: 'Sides' },
  { name: 'Cajun Fries',               category: 'Sides' },
  { name: 'Seasoned Rice',             category: 'Sides' },
  { name: 'Veggie Sticks (Celery & Carrots)', category: 'Sides' },
  { name: 'Ranch Dip',                 category: 'Sides' },
  { name: 'Blue Cheese Dip',           category: 'Sides' },
];

class Wingstop extends BaseScraper {
  constructor() {
    super({ chainName: 'Wingstop', officialUrl: OFFICIAL_URL });
  }

  async discoverMenuItems() {
    // Wingstop allergen data is PDF-only; HTML page has no parseable allergen table.
    logger.info(`Using known item list (${KNOWN_ITEMS.length} items) — allergen data in PDF only`, { chain: this.chainName });
    logger.warn(`Allergen PDF: ${ALLERGEN_PDF}`, { chain: this.chainName });
    return KNOWN_ITEMS;
  }

  async extractAllergens(item) {
    const row = makeEmptyRow();
    row.menuCategory = item.category;
    row.itemName     = item.name;
    row.sourceUrl    = OFFICIAL_URL;
    row.scrapeDate   = new Date().toISOString();

    for (const a of ALLERGENS) row[a] = 'COULD_NOT_VERIFY';
    row.crossContact = 'COULD_NOT_VERIFY';
    row.confidence   = 'COULD_NOT_VERIFY';
    row.sourceText   = `Allergen data only in PDF guide: ${ALLERGEN_PDF}`;
    return row;
  }
}

module.exports = Wingstop;
