'use strict';

/**
 * Panda Express Allergen Scraper
 *
 * The /usca/en/allergens URL is consistently bot-blocked ("Access is temporarily restricted").
 *
 * Strategy:
 *   1. Set up network interception on the main menu page to capture any allergen API responses
 *   2. Navigate to /menu/entrees and monitor XHR/fetch for JSON with allergen data
 *   3. If API data captured — parse it
 *   4. If still blocked — fall back to known items list with CNV
 *      (Panda Express publishes an allergen PDF; HTML allergen matrix not accessible via browser)
 *
 * Panda's allergen columns (from published PDF guide):
 *   WHEAT, EGG, MILK, SOY, FISH, SHELLFISH, TREE NUTS, PEANUT, SESAME
 */

const BaseScraper = require('./BaseScraper');
const Bottleneck  = require('bottleneck');
const { logger }  = require('../utils/logger');
const { makeEmptyRow, ALLERGENS } = require('../output/schema');

const OFFICIAL_URL    = 'https://www.pandaexpress.com/usca/en/allergens';
const ALLERGEN_PDF    = 'https://www.pandaexpress.com/content/dam/pandaexpress/nutritional_and_allergen_info.pdf';
const MENU_URL        = 'https://www.pandaexpress.com/menu';

const COLUMN_MAP = {
  'milk':          'milk',
  'dairy':         'milk',
  'egg':           'eggs',
  'eggs':          'eggs',
  'fish':          'fish',
  'shellfish':     'shellfish',
  'tree nut':      'treeNuts',
  'tree nuts':     'treeNuts',
  'peanut':        'peanuts',
  'peanuts':       'peanuts',
  'wheat':         'wheat',
  'gluten':        'wheat',
  'soy':           'soy',
  'soybean':       'soy',
  'sesame':        'sesame',
};

// Known Panda Express menu items (stable core menu)
const KNOWN_ITEMS = [
  // Entrees
  { name: 'Orange Chicken',                category: 'Entrees' },
  { name: 'Beijing Beef',                  category: 'Entrees' },
  { name: 'Kung Pao Chicken',              category: 'Entrees' },
  { name: 'Broccoli Beef',                 category: 'Entrees' },
  { name: 'Mushroom Chicken',              category: 'Entrees' },
  { name: 'SweetFire Chicken Breast',      category: 'Entrees' },
  { name: 'String Bean Chicken Breast',    category: 'Entrees' },
  { name: 'Honey Sesame Chicken Breast',   category: 'Entrees' },
  { name: 'Black Pepper Chicken',          category: 'Entrees' },
  { name: 'Grilled Teriyaki Chicken',      category: 'Entrees' },
  { name: 'Honey Walnut Shrimp',           category: 'Entrees' },
  { name: 'Shanghai Angus Steak',          category: 'Entrees' },
  { name: 'Black Pepper Sirloin Steak',    category: 'Entrees' },
  { name: 'Firecracker Shrimp',            category: 'Entrees' },
  { name: 'Wok-Tossed Shrimp',             category: 'Entrees' },
  // Sides
  { name: 'Chow Mein',                     category: 'Sides' },
  { name: 'Fried Rice',                    category: 'Sides' },
  { name: 'Steamed White Rice',            category: 'Sides' },
  { name: 'Super Greens',                  category: 'Sides' },
  { name: 'Mixed Vegetables',              category: 'Sides' },
  // Appetizers
  { name: 'Cream Cheese Rangoon',          category: 'Appetizers' },
  { name: 'Apple Pie Roll',                category: 'Appetizers' },
  { name: 'Veggie Spring Roll',            category: 'Appetizers' },
  { name: 'Chicken Egg Roll',              category: 'Appetizers' },
];

class PandaExpress extends BaseScraper {
  constructor() {
    super({ chainName: 'PandaExpress', officialUrl: OFFICIAL_URL });
    this._headers       = null;
    this._apiData       = null;
    this._limiter       = new Bottleneck({ minTime: 3000, maxConcurrent: 1 });
  }

  async discoverMenuItems() {
    // Try to intercept network calls for allergen/menu JSON data
    const apiItems = await this._tryNetworkInterception();
    if (apiItems && apiItems.length > 0) {
      logger.info(`Network interception: ${apiItems.length} items captured`, { chain: this.chainName });
      return apiItems;
    }

    // Try allergen page with longer wait + human-like behavior
    const matrixItems = await this._tryAllergenPage();
    if (matrixItems.length > 0) {
      logger.info(`Allergen page: ${matrixItems.length} items`, { chain: this.chainName });
      return matrixItems;
    }

    // Fall back to known items list
    logger.warn(`Bot-blocked on all URL variants — using known items list (${KNOWN_ITEMS.length} items)`, { chain: this.chainName });
    logger.warn(`Allergen PDF available at: ${ALLERGEN_PDF}`, { chain: this.chainName });
    return KNOWN_ITEMS;
  }

  async _tryNetworkInterception() {
    return new Promise(async (resolve) => {
      const captured = [];
      let resolved   = false;

      const done = (items) => {
        if (!resolved) { resolved = true; resolve(items); }
      };

      // Listen for responses that may contain allergen/nutrition JSON
      this.page.on('response', async (response) => {
        const url = response.url();
        if (!url.includes('allergen') && !url.includes('nutrition') && !url.includes('menu')) return;
        const ct = response.headers()['content-type'] || '';
        if (!ct.includes('json')) return;
        try {
          const body = await response.json();
          const items = this._parseApiResponse(body);
          if (items.length > 0) captured.push(...items);
        } catch { /* skip */ }
      });

      const ok = await this.navigateTo(MENU_URL);
      if (!ok) { done([]); return; }

      try { await this.page.waitForLoadState('networkidle', { timeout: 15000 }); } catch { /* ok */ }
      await this.page.waitForTimeout(3000);
      await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await this.page.waitForTimeout(2000);

      done(captured);
    }).catch(() => []);
  }

  _parseApiResponse(body) {
    const items = [];
    // Handle various shapes: array of items, { items: [...] }, { menu: [...] }, etc.
    const list = Array.isArray(body) ? body :
                 body.items || body.menu || body.products || body.data || [];
    if (!Array.isArray(list)) return items;

    for (const entry of list) {
      const name = entry.name || entry.itemName || entry.productName || '';
      if (!name) continue;
      const category = entry.category || entry.menuGroup || 'Menu';
      items.push({ name, category, _apiData: entry });
    }
    return items;
  }

  async _tryAllergenPage() {
    const URLS = [
      'https://www.pandaexpress.com/allergens',
      'https://www.pandaexpress.com/usca/en/allergens',
      'https://www.pandaexpress.com/nutrition',
    ];

    for (const url of URLS) {
      const ok = await this.navigateTo(url);
      if (!ok) continue;

      try { await this.page.waitForLoadState('networkidle', { timeout: 20000 }); } catch { /* ok */ }
      await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await this.page.waitForTimeout(5000);
      await this.page.evaluate(() => window.scrollTo(0, 0));

      const bodyText = await this.page.innerText('body').catch(() => '');
      if (bodyText.toLowerCase().includes('access is temporarily restricted') ||
          bodyText.toLowerCase().includes('unusual activity')) {
        logger.warn(`Bot blocked at ${url}`, { chain: this.chainName });
        continue;
      }

      await this.takeScreenshot(`allergen-${url.split('/').pop()}`);

      const tableCount = await this.page.$$eval('table', ts => ts.length).catch(() => 0);
      if (tableCount > 0) {
        const items = await this._parseTable();
        if (items.length > 0) return items;
      }
    }
    return [];
  }

  async _parseTable() {
    const data = await this.page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('table'));
      if (!tables.length) return null;
      const table = tables.reduce((a, b) =>
        b.querySelectorAll('tr').length > a.querySelectorAll('tr').length ? b : a
      );
      const rows = Array.from(table.querySelectorAll('tr'));
      if (rows.length < 2) return null;
      const headers = Array.from(rows[0].querySelectorAll('th,td'))
        .map(c => (c.innerText || '').trim().toLowerCase());
      const items = [];
      let currentCategory = 'Menu';
      for (let i = 1; i < rows.length; i++) {
        const cells = Array.from(rows[i].querySelectorAll('td,th'));
        if (!cells.length) continue;
        const firstName = (cells[0].innerText || '').trim();
        if (!firstName) continue;
        if (cells.length === 1) { currentCategory = firstName; continue; }
        const values = [];
        cells.forEach((cell, idx) => {
          if (idx === 0) return;
          const txt  = (cell.innerText || '').trim();
          const icon = cell.querySelector('img,svg,[class*="check"],[class*="icon"]');
          values.push((txt && txt !== '-' && txt !== 'n/a') || !!icon ? 'present' : '');
        });
        items.push({ name: firstName, category: currentCategory, _values: values });
      }
      return { headers, items };
    });
    if (!data || !data.items.length) return [];
    this._headers = data.headers;
    return data.items;
  }

  // ─── Override scrape() for rate-limited path ──────────────────────────────
  async scrape() {
    logger.info('Starting scrape', { chain: this.chainName });
    this.results = [];
    this.errors  = [];

    const items = await this.discoverMenuItems();
    this._discoveredCount = items.length;
    if (items.length === 0) { logger.error('No items discovered', { chain: this.chainName }); return []; }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      logger.info(`[${i + 1}/${items.length}] ${item.name}`, { chain: this.chainName });
      let row;
      try {
        row = await this._limiter.schedule(() => this.extractAllergens(item));
        if (!row) row = this.buildCNVRow(item.category, item.name, OFFICIAL_URL, 'null returned');
      } catch (err) {
        row = this.buildCNVRow(item.category, item.name, OFFICIAL_URL, `Exception: ${err.message}`);
      }
      row.rowNum = this.results.length + 1;
      this.validateRow(row);
      this.results.push(row);
    }

    logger.info(`Scrape complete — ${this.results.length} rows`, { chain: this.chainName });
    return this.results;
  }

  async extractAllergens(item) {
    const row = makeEmptyRow();
    row.menuCategory = item.category;
    row.itemName     = item.name;
    row.sourceUrl    = OFFICIAL_URL;
    row.scrapeDate   = new Date().toISOString();

    // API data path
    if (item._apiData) {
      const d = item._apiData;
      const allergenText = d.allergens || d.allergenInfo || d.contains || '';
      if (allergenText) {
        const parsed = this.parseAllergenText(String(allergenText));
        Object.assign(row, parsed);
        return row;
      }
    }

    // Table values path
    if (item._values && this._headers) {
      const presentAllergens = [];
      let anyMapped = false;
      this._headers.forEach((header, i) => {
        const key = COLUMN_MAP[header];
        if (!key) return;
        const isPresent = !!(item._values[i - 1]);
        if (isPresent) presentAllergens.push(header);
        row[key] = isPresent ? 'TRUE' : 'FALSE';
        anyMapped = true;
      });
      if (anyMapped) {
        row.confidence   = 'HIGH';
        row.crossContact = 'NO';
        row.sourceText   = presentAllergens.length > 0 ? `Contains: ${presentAllergens.join(', ')}` : 'No allergens listed';
        return row;
      }
    }

    // Known items fallback — mark CNV, note PDF location
    for (const a of ALLERGENS) row[a] = 'COULD_NOT_VERIFY';
    row.crossContact = 'COULD_NOT_VERIFY';
    row.confidence   = 'COULD_NOT_VERIFY';
    row.sourceText   = `Bot-blocked on HTML allergen page. Allergen PDF: ${ALLERGEN_PDF}`;
    return row;
  }
}

module.exports = PandaExpress;
