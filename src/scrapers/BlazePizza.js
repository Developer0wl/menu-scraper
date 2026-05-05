'use strict';
const HybridScraper = require('./HybridScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow, ALLERGENS } = require('../output/schema');

const NUTRITIONIX_URL = 'https://www.nutritionix.com/blaze-pizza/nutrition-calculator/premium';
const OFFICIAL_URL = 'https://blazepizza.com/nutrition';

// Map Nutritionix allergen keys to our schema
const NX_ALLERGEN_MAP = {
  milk: 'allergen_contains_Milk',
  eggs: 'allergen_contains_Eggs',
  fish: 'allergen_contains_Fish',
  shellfish: 'allergen_contains_Shellfish',
  treeNuts: 'allergen_contains_Tree_Nuts',
  peanuts: 'allergen_contains_Peanuts',
  wheat: 'allergen_contains_Wheat',
  soy: 'allergen_contains_Soy',
  sesame: 'allergen_contains_Sesame'
};

class BlazePizza extends HybridScraper {
  constructor() { 
    super({ chainName: 'BlazePizza', officialUrl: OFFICIAL_URL });
  }

  async _discoverViaAPI() {
    // Navigate directly to the Nutritionix calculator that powers Blaze Pizza
    const ok = await this.navigateTo(NUTRITIONIX_URL);
    if (!ok) return null;

    // Wait for the JSON data payload to load
    const json = await this.waitForApiResponse(/calculator\/.*?\.json/);
    if (!json || !json.calculator) {
      logger.warn('Could not intercept Nutritionix API payload', { chain: this.chainName });
      return null;
    }

    const itemsObj = json.calculator.items || {};
    const ingredientsObj = json.calculator.ingredients || {};
    const categoriesObj = json.calculator.categories || {};

    const apiItems = [];

    // Nutritionix separates top-level "items" (which might be templates) and "ingredients" (actual menu items like bases, sauces)
    // We will extract both to ensure complete coverage, but mainly ingredients since Blaze is a build-your-own model.

    for (const key of Object.keys(ingredientsObj)) {
      const ing = ingredientsObj[key];
      if (ing && ing.name) {
        apiItems.push({
          name: ing.name.trim(),
          category: 'Ingredients',
          _nxData: ing
        });
      }
    }

    // Optional: add pre-built template items
    for (const key of Object.keys(itemsObj)) {
      const itm = itemsObj[key];
      if (itm && itm.name) {
        // Look up category name if possible
        const cat = categoriesObj[itm.category_id] ? categoriesObj[itm.category_id].name : 'Pizza';
        apiItems.push({
          name: itm.name.trim(),
          category: cat,
          _nxData: itm
        });
      }
    }

    return apiItems;
  }

  async extractAllergens(item) {
    const row = makeEmptyRow();
    row.menuCategory = item.category; 
    row.itemName = item.name;
    row.sourceUrl = OFFICIAL_URL; 
    row.scrapeDate = new Date().toISOString();

    if (!item._nxData) {
      row.sourceText = 'No API data found';
      return row;
    }

    const nx = item._nxData;
    let hasMapped = false;
    let present = [];

    for (const a of ALLERGENS) {
      const nxKey = NX_ALLERGEN_MAP[a];
      const val = nx[nxKey];
      
      if (val === 1) {
        row[a] = 'TRUE';
        present.push(a);
        hasMapped = true;
      } else if (val === 0) {
        row[a] = 'FALSE';
        hasMapped = true;
      } else {
        // -1 means unknown or not applicable
        row[a] = 'COULD_NOT_VERIFY';
      }
    }

    if (hasMapped) {
      row.confidence = 'HIGH';
      row.crossContact = 'NO';
      row.sourceText = present.length > 0 ? `API Contains: ${present.join(', ')}` : 'API: No allergens indicated';
    } else {
      row.confidence = 'COULD_NOT_VERIFY';
      row.crossContact = 'COULD_NOT_VERIFY';
      row.sourceText = 'Allergen fields were undefined (-1) in API';
    }

    return row;
  }
}
module.exports = BlazePizza;
