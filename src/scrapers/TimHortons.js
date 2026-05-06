'use strict';
const HybridScraper = require('./HybridScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow, ALLERGENS } = require('../output/schema');

const GRAPHQL_URL = 'https://czqk28jt.apicdn.sanity.io/v1/graphql/prod_th_us/default';
const OFFICIAL_URL = 'https://www.timhortons.com/nutrition-and-wellness';

class TimHortons extends HybridScraper {
  constructor() {
    super({ chainName: 'TimHortons', officialUrl: OFFICIAL_URL });
  }

  async _discoverViaAPI() {
    const query = `query { 
      allItems(limit: 1000) { 
        _id 
        name { en } 
        allergens { 
          milk eggs fish shellfish treeNuts peanuts wheat soy sesame
        } 
      } 
    }`;

    try {
      const res = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const json = await res.json();
      const items = json.data?.allItems || [];
      
      // Filter for items that actually have allergen data
      return items.filter(i => i.allergens && Object.values(i.allergens).some(v => v !== null))
        .map(i => ({
          name: i.name.en,
          category: 'Menu',
          _apiData: i.allergens
        }));
    } catch (err) {
      logger.error('TimHortons API fetch failed', { error: err.message });
      return null;
    }
  }

  async extractAllergens(item) {
    const row = makeEmptyRow();
    row.menuCategory = item.category;
    row.itemName = item.name;
    row.sourceUrl = OFFICIAL_URL;

    const data = item._apiData;
    let present = [];

    for (const a of ALLERGENS) {
      const val = data[a];
      if (val === 3) {
        row[a] = 'TRUE';
        present.push(a);
      } else if (val === 2) {
        row[a] = 'FALSE'; // We map "May Contain" to FALSE + CrossContact TRUE
        row.crossContact = 'TRUE';
      } else if (val === 0 || val === 1) {
        row[a] = 'FALSE';
      } else {
        row[a] = 'COULD_NOT_VERIFY';
      }
    }

    row.confidence = 'HIGH';
    row.sourceText = present.length > 0 ? `API Contains: ${present.join(', ')}` : 'API: No allergens indicated';
    return row;
  }
}

module.exports = TimHortons;
