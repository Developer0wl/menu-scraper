'use strict';

const BaseScraper = require('./BaseScraper');
const { logger }  = require('../utils/logger');
const { makeEmptyRow, ALLERGENS } = require('../output/schema');

const OFFICIAL_URL = 'https://littlecaesars.com/en-us/nutrition';

const COLUMN_MAP = {
  'milk': 'milk', 'dairy': 'milk', 'egg': 'eggs', 'eggs': 'eggs',
  'fish': 'fish', 'shellfish': 'shellfish', 'tree nut': 'treeNuts',
  'tree nuts': 'treeNuts', 'peanut': 'peanuts', 'peanuts': 'peanuts',
  'wheat': 'wheat', 'gluten': 'wheat', 'soy': 'soy', 'soybean': 'soy',
  'sesame': 'sesame',
};

const KNOWN_ITEMS = [
  { name: 'Classic Pepperoni', category: 'Pizza' },
  { name: 'Classic Cheese', category: 'Pizza' },
  { name: 'ExtraMostBestest Pepperoni', category: 'Pizza' },
  { name: 'ExtraMostBestest Cheese', category: 'Pizza' },
  { name: 'Detroit-Style Deep Dish Pepperoni', category: 'Pizza' },
  { name: 'Detroit-Style Deep Dish Cheese', category: 'Pizza' },
  { name: 'Thin Crust Pepperoni', category: 'Pizza' },
  { name: 'Stuffed Crust Pepperoni', category: 'Pizza' },
  { name: 'Stuffed Crust Cheese', category: 'Pizza' },
  { name: 'Veggie', category: 'Pizza' },
  { name: '3 Meat Treat', category: 'Pizza' },
  { name: 'Ultimate Supreme', category: 'Pizza' },
  { name: 'Hula Hawaiian', category: 'Pizza' },
  { name: 'Classic Wings (Plain)', category: 'Wings' },
  { name: 'Classic Wings (BBQ)', category: 'Wings' },
  { name: 'Classic Wings (Buffalo)', category: 'Wings' },
  { name: 'Crazy Bread', category: 'Sides' },
  { name: 'Crazy Sauce', category: 'Sides' },
  { name: 'Italian Cheese Bread', category: 'Sides' },
  { name: 'Stuffed Crazy Bread', category: 'Sides' },
  { name: 'Pepperoni Cheese Bread', category: 'Sides' },
];

class LittleCaesars extends BaseScraper {
  constructor() {
    super({ chainName: 'LittleCaesars', officialUrl: OFFICIAL_URL });
    this._headers = null;
  }

  async discoverMenuItems() {
    const ok = await this.navigateTo(OFFICIAL_URL);
    if (!ok) return KNOWN_ITEMS;

    try { await this.page.waitForLoadState('networkidle', { timeout: 25000 }); } catch { /* ok */ }
    await this.page.waitForTimeout(3000);
    await this.takeScreenshot('nutrition-page');

    const tableItems = await this._parseTable();
    if (tableItems.length > 0) return tableItems;

    const bodyItems = await this._parseBodyText();
    if (bodyItems.length > 0) return bodyItems;

    logger.warn(`Falling back to ${KNOWN_ITEMS.length} known items`, { chain: this.chainName });
    return KNOWN_ITEMS;
  }

  async _parseTable() {
    const data = await this.page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('table'));
      if (!tables.length) return null;
      const best = tables.reduce((a, b) =>
        b.querySelectorAll('tr').length > a.querySelectorAll('tr').length ? b : a);
      const rows = Array.from(best.querySelectorAll('tr'));
      if (rows.length < 2) return null;
      const headers = Array.from(rows[0].querySelectorAll('th, td'))
        .map(c => (c.innerText || '').trim().toLowerCase());
      const items = [];
      let cat = 'Menu';
      for (let i = 1; i < rows.length; i++) {
        const cells = Array.from(rows[i].querySelectorAll('td, th'));
        if (!cells.length) continue;
        const name = (cells[0].innerText || '').trim();
        if (!name) continue;
        if (cells.length <= 1) { cat = name; continue; }
        const values = cells.slice(1).map(cell => {
          const txt = (cell.innerText || '').trim().toLowerCase();
          const icon = !!(cell.querySelector('img, svg, [class*="check"]'));
          return (icon || (txt && txt !== '-' && txt !== 'no' && txt.length < 6)) ? 'present' : '';
        });
        items.push({ name, category: cat, _values: values });
      }
      return { headers, items };
    });
    if (!data || !data.items.length) return [];
    this._headers = data.headers;
    return data.items;
  }

  async _parseBodyText() {
    const body = await this.page.innerText('body').catch(() => '');
    const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
    const items = []; let cat = 'Menu'; const seen = new Set();
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (line.length < 50 && /^[A-Z][A-Z\s&\-\/]+$/.test(line)) { cat = line; continue; }
      if (lower.includes('contains') && (lower.includes('milk') || lower.includes('wheat') || lower.includes('soy') || lower.includes('egg'))) {
        const name = line.slice(0, 80);
        if (!seen.has(name)) { seen.add(name); items.push({ name, category: cat, _rawText: line }); }
      }
    }
    return items;
  }

  async extractAllergens(item) {
    const row = makeEmptyRow();
    row.menuCategory = item.category;
    row.itemName = item.name;
    row.sourceUrl = OFFICIAL_URL;
    row.scrapeDate = new Date().toISOString();

    if (item._rawText) { Object.assign(row, this.parseAllergenText(item._rawText)); return row; }

    if (item._values && this._headers) {
      const present = []; let anyMapped = false;
      this._headers.forEach((header, i) => {
        const key = COLUMN_MAP[header]; if (!key) return;
        const isPresent = item._values[i - 1] === 'present';
        if (isPresent) present.push(header);
        row[key] = isPresent ? 'TRUE' : 'FALSE'; anyMapped = true;
      });
      if (anyMapped) {
        row.confidence = 'HIGH'; row.crossContact = 'NO';
        row.sourceText = present.length > 0 ? `Contains: ${present.join(', ')}` : 'No allergens listed';
        return row;
      }
    }

    for (const a of ALLERGENS) row[a] = 'COULD_NOT_VERIFY';
    row.crossContact = 'COULD_NOT_VERIFY'; row.confidence = 'COULD_NOT_VERIFY';
    row.sourceText = 'Check littlecaesars.com/en-us/nutrition';
    return row;
  }
}

module.exports = LittleCaesars;
