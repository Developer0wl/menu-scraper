'use strict';

/**
 * Five Guys Allergen Scraper
 *
 * Strategy: https://www.fiveguys.com/nutritional-allergy-information/
 *
 * The landing page has a "VIEW NUTRITION & ALLERGEN INFO" button that opens
 * a PDF file in a new tab — there is no HTML allergen table accessible via browser.
 *
 * Known allergen data is available in their published PDF guide.
 * This scraper uses a hardcoded known-items list and marks all rows CNV,
 * directing users to the PDF.
 *
 * Five Guys allergen columns (from PDF): MILK, EGGS, WHEAT, SOY, PEANUTS,
 * TREE NUTS, FISH, SHELLFISH, SESAME
 */

const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow, ALLERGENS } = require('../output/schema');

const OFFICIAL_URL  = 'https://www.fiveguys.com/nutritional-allergy-information/';
const ALLERGEN_PDF  = 'https://www.fiveguys.com/content/dam/fiveguys/NutritionalAllergen/Five-Guys-Allergen-Information.pdf';

// Five Guys' menu is well-known and extremely stable
const KNOWN_ITEMS = [
  // Burgers
  { name: 'Hamburger',                  category: 'Burgers' },
  { name: 'Cheeseburger',               category: 'Burgers' },
  { name: 'Bacon Burger',               category: 'Burgers' },
  { name: 'Bacon Cheeseburger',         category: 'Burgers' },
  { name: 'Little Hamburger',           category: 'Burgers' },
  { name: 'Little Cheeseburger',        category: 'Burgers' },
  { name: 'Little Bacon Burger',        category: 'Burgers' },
  { name: 'Little Bacon Cheeseburger',  category: 'Burgers' },
  // Hot Dogs
  { name: 'Hot Dog',                    category: 'Hot Dogs' },
  { name: 'Cheese Dog',                 category: 'Hot Dogs' },
  { name: 'Bacon Dog',                  category: 'Hot Dogs' },
  { name: 'Bacon Cheese Dog',           category: 'Hot Dogs' },
  // Sandwiches
  { name: 'Veggie Sandwich',            category: 'Sandwiches' },
  { name: 'Cheese Veggie Sandwich',     category: 'Sandwiches' },
  { name: 'Grilled Cheese',             category: 'Sandwiches' },
  { name: 'BLT',                        category: 'Sandwiches' },
  // Fries & Sides
  { name: 'Five Guys Style Fries',      category: 'Fries & Sides' },
  { name: 'Cajun Style Fries',          category: 'Fries & Sides' },
  { name: 'Five Guys Style Fries (Large)', category: 'Fries & Sides' },
  // Milkshakes
  { name: 'Chocolate Milkshake',        category: 'Milkshakes' },
  { name: 'Vanilla Milkshake',          category: 'Milkshakes' },
  { name: 'Strawberry Milkshake',       category: 'Milkshakes' },
  { name: 'Banana Milkshake',           category: 'Milkshakes' },
  { name: 'Peanut Butter Milkshake',    category: 'Milkshakes' },
  { name: 'Oreo Cookie Milkshake',      category: 'Milkshakes' },
];

class FiveGuys extends BaseScraper {
  constructor() {
    super({ chainName: 'FiveGuys', officialUrl: OFFICIAL_URL });
  }

  async discoverMenuItems() {
    // Five Guys allergen data is PDF-only; HTML page has no parseable allergen table.
    // Return known items list — all will be marked CNV with PDF reference.
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

module.exports = FiveGuys;
