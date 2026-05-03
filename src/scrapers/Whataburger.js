'use strict';
const BaseScraper = require('./BaseScraper');
const PDFScraper = require('./PDFScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow, ALLERGENS } = require('../output/schema');

const OFFICIAL_URL = 'https://whataburger.com/food/allergens';
const ALT_URL = 'https://whataburger.com/food/nutrition';
const COLUMN_MAP = {
  'milk':'milk','dairy':'milk','egg':'eggs','eggs':'eggs','fish':'fish','shellfish':'shellfish',
  'tree nut':'treeNuts','tree nuts':'treeNuts','peanut':'peanuts','peanuts':'peanuts',
  'wheat':'wheat','gluten':'wheat','soy':'soy','soybean':'soy','sesame':'sesame',
};
const KNOWN_ITEMS = [
  { name: 'Whataburger',                   category: 'Burgers' },
  { name: 'Double Meat Whataburger',        category: 'Burgers' },
  { name: 'Triple Meat Whataburger',        category: 'Burgers' },
  { name: 'Whataburger Jr.',                category: 'Burgers' },
  { name: 'Jalapeno & Cheese Whataburger',  category: 'Burgers' },
  { name: 'Bacon & Cheese Whataburger',     category: 'Burgers' },
  { name: 'Green Chile Double',             category: 'Burgers' },
  { name: 'Avocado Bacon Burger',           category: 'Burgers' },
  { name: 'Whataburger Patty Melt',         category: 'Burgers' },
  { name: 'Whatachickn Sandwich',           category: 'Chicken' },
  { name: 'Spicy Whatachickn Sandwich',     category: 'Chicken' },
  { name: 'Grilled Chicken Sandwich',       category: 'Chicken' },
  { name: 'Whatachickn Strips 3 piece',     category: 'Chicken' },
  { name: 'Egg & Cheese Biscuit',           category: 'Breakfast' },
  { name: 'Sausage & Egg Biscuit',          category: 'Breakfast' },
  { name: 'Bacon & Egg Biscuit',            category: 'Breakfast' },
  { name: 'Breakfast On A Bun',             category: 'Breakfast' },
  { name: 'Taquito with Cheese',            category: 'Breakfast' },
  { name: 'Pancakes',                       category: 'Breakfast' },
  { name: 'French Fries',                   category: 'Sides' },
  { name: 'Onion Rings',                    category: 'Sides' },
  { name: 'Apple Slices',                   category: 'Sides' },
  { name: 'Chocolate Shake',                category: 'Drinks' },
  { name: 'Vanilla Shake',                  category: 'Drinks' },
  { name: 'Strawberry Shake',               category: 'Drinks' },
];

class Whataburger extends BaseScraper {
  constructor() { super({ chainName: 'Whataburger', officialUrl: OFFICIAL_URL }); this._headers = null; }

  async discoverMenuItems() {
    logger.info(`Whataburger URL is a PDF, using PDFScraper`, { chain: this.chainName });
    const pdfScraper = new PDFScraper({ chainName: this.chainName, pdfUrl: OFFICIAL_URL, officialUrl: OFFICIAL_URL });
    const pdfRows = await pdfScraper.scrape();
    
    if (pdfRows.length > 0) {
      logger.info(`PDF parse yielded ${pdfRows.length} rows`, { chain: this.chainName });
      this._pdfRows = pdfRows;
      return pdfRows.map(r => ({ name: r.itemName, category: r.menuCategory, _pdfRow: r }));
    }

    logger.warn(`Falling back to ${KNOWN_ITEMS.length} known items`, { chain: this.chainName });
    return KNOWN_ITEMS;
  }

  async extractAllergens(item) {
    if (item._pdfRow) return item._pdfRow;

    const row = makeEmptyRow();
    row.menuCategory = item.category; row.itemName = item.name;
    row.sourceUrl = OFFICIAL_URL; row.scrapeDate = new Date().toISOString();
    
    for (const a of ALLERGENS) row[a] = 'COULD_NOT_VERIFY';
    row.crossContact = 'COULD_NOT_VERIFY'; row.confidence = 'COULD_NOT_VERIFY';
    row.sourceText = 'Allergen PDF could not be parsed automatically';
    return row;
  }
}
module.exports = Whataburger;
