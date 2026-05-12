'use strict';
const https = require('https');
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow, ALLERGENS } = require('../output/schema');

const OFFICIAL_URL = 'https://www.whitecastle.com/about-us/restaurant-menu-ingredient-list';

// WC field name → our schema key
const WC_KEY_MAP = {
  'Milk':      'milk',
  'Egg':       'eggs',
  'Fish':      'fish',
  'Shellfish': 'shellfish',
  'Tree nuts': 'treeNuts',
  'Peanuts':   'peanuts',
  'Wheat':     'wheat',
  'Soybean':   'soy',
  // Sesame not present in WC data — left as COULD_NOT_VERIFY
};

// Fix UTF-8 text that was incorrectly decoded as Latin-1 (Windows mojibake)
function fixMojibake(str) {
  return str
    .replace(/Â®/g, '®')   // Â® → ®
    .replace(/Â©/g, '©')   // Â© → ©
    .replace(/Â½/g, '½')   // Â½ → ½
    .replace(/â/g, '’')  // â€™ → '
    .replace(/â/g, '“')  // â€œ → "
    .replace(/â/g, '”'); // â€  → "
}

function parseWcValue(v) {
  if (v === 'WC_CONTAINS_ALERGENS') return 'TRUE';
  if (v === 'WC_MAY_CONTAIN_ALERGENS') return 'TRUE'; // err on side of caution
  return 'FALSE';
}

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    };
    https.get(url, options, res => {
      const bufs = [];
      res.on('data', chunk => bufs.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(bufs).toString('utf8') }));
    }).on('error', reject);
  });
}

class WhiteCastle extends BaseScraper {
  constructor() { super({ chainName: 'WhiteCastle', officialUrl: OFFICIAL_URL }); }

  async init() {}
  async close() {}

  async scrape() {
    logger.info('Fetching White Castle HTML directly', { chain: this.chainName });
    this.results = [];
    this.errors  = [];

    let body;
    try {
      const res = await fetchHtml(OFFICIAL_URL);
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      body = res.body;
    } catch (err) {
      logger.error(`Fetch failed: ${err.message}`, { chain: this.chainName });
      this._discoveredCount = 0;
      return [];
    }

    // Extract the wc-nutrition-information component data attribute
    const match = body.match(/wc-nutrition-information\s+:data='(\{[^']+\})'/);
    if (!match) {
      logger.warn('Could not find embedded allergen JSON in White Castle HTML', { chain: this.chainName });
      this._discoveredCount = 0;
      return [];
    }

    let menuData;
    try {
      menuData = JSON.parse(match[1]);
    } catch (e) {
      logger.error(`JSON parse failed: ${e.message}`, { chain: this.chainName });
      this._discoveredCount = 0;
      return [];
    }

    const rows = [];
    const scrapeDate = new Date().toISOString();

    for (const [rawCategory, items] of Object.entries(menuData)) {
      const category = rawCategory.replace(/\*$/, '').trim(); // strip trailing *
      if (!Array.isArray(items)) continue;

      for (const item of items) {
        if (!item.title || !item.data) continue;

        const row = makeEmptyRow();
        row.menuCategory = category;
        row.itemName     = fixMojibake(item.title.trim());
        row.sourceUrl    = OFFICIAL_URL;
        row.scrapeDate   = scrapeDate;

        const allergenData = item.data;
        let hasTrueAllergen = false;
        let hasMayContain   = false;

        for (const [wcKey, ourKey] of Object.entries(WC_KEY_MAP)) {
          const val = allergenData[wcKey];
          if (val === 'WC_CONTAINS_ALERGENS') {
            row[ourKey] = 'TRUE';
            hasTrueAllergen = true;
          } else if (val === 'WC_MAY_CONTAIN_ALERGENS') {
            row[ourKey] = 'TRUE';
            hasMayContain = true;
          } else {
            row[ourKey] = 'FALSE';
          }
        }
        // Sesame not tracked by White Castle
        row.sesame = 'COULD_NOT_VERIFY';

        row.crossContact = hasMayContain ? 'TRUE' : 'FALSE';
        row.confidence   = hasTrueAllergen || hasMayContain ? 'HIGH' : 'HIGH';
        row.sourceText   = 'White Castle embedded allergen JSON — whitecastle.com/about-us/restaurant-menu-ingredient-list';
        row.rowNum       = rows.length + 1;

        this.validateRow(row);
        rows.push(row);
      }
    }

    this.results          = rows;
    this._discoveredCount = rows.length;
    logger.info(`White Castle: ${rows.length} rows extracted`, { chain: this.chainName });
    return rows;
  }
}

module.exports = WhiteCastle;

