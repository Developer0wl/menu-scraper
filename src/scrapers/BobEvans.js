'use strict';
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow, ALLERGENS } = require('../output/schema');
const OFFICIAL_URL = 'https://www.bobevans.com/nutrition';
const ALT_URL = 'https://www.bobevans.com/menu';
const COLUMN_MAP = { 'milk':'milk','dairy':'milk','egg':'eggs','eggs':'eggs','fish':'fish','shellfish':'shellfish','tree nut':'treeNuts','tree nuts':'treeNuts','peanut':'peanuts','peanuts':'peanuts','wheat':'wheat','gluten':'wheat','soy':'soy','soybean':'soy','sesame':'sesame' };
const KNOWN_ITEMS = [
  { name: 'Rise & Shine Breakfast', category: 'Breakfast' },
  { name: 'Farmer Breakfast', category: 'Breakfast' },
  { name: 'Sunshine Skillet', category: 'Breakfast' },
  { name: 'Stacked & Stuffed Hotcakes', category: 'Breakfast' },
  { name: 'Buttermilk Hotcakes', category: 'Breakfast' },
  { name: 'French Toast', category: 'Breakfast' },
  { name: 'Sausage Gravy & Biscuit', category: 'Breakfast' },
  { name: 'Pot Roast Dinner', category: 'Farm Fresh Meals' },
  { name: 'Bob Evans Chicken', category: 'Farm Fresh Meals' },
  { name: 'Open Faced Turkey & Stuffing', category: 'Farm Fresh Meals' },
  { name: 'Country Fried Steak', category: 'Farm Fresh Meals' },
  { name: 'Salmon', category: 'Farm Fresh Meals' },
  { name: 'Grilled Chicken', category: 'Farm Fresh Meals' },
  { name: 'Bob Evans Cobb Salad', category: 'Salads' },
  { name: 'Farmhouse Salad', category: 'Salads' },
  { name: 'Mashed Potatoes', category: 'Sides' },
  { name: 'Green Beans', category: 'Sides' },
  { name: 'Coleslaw', category: 'Sides' },
  { name: 'Macaroni & Cheese', category: 'Sides' },
  { name: 'Bob Evans Rolls', category: 'Sides' },
];
class BobEvans extends BaseScraper {
  constructor() { super({ chainName: 'BobEvans', officialUrl: OFFICIAL_URL }); this._headers = null; }

  async discoverMenuItems() {
    let ok = await this.navigateTo(OFFICIAL_URL);
    if (!ok) ok = await this.navigateTo(ALT_URL);
    if (!ok) { logger.warn('Could not load page — using known items', { chain: this.chainName }); return KNOWN_ITEMS; }
    try { await this.page.waitForLoadState('networkidle', { timeout: 25000 }); } catch { /* ok */ }
    await this.page.waitForTimeout(3000);
    await this.takeScreenshot('nutrition-page');
    const tableItems = await this._parseTable();
    if (tableItems.length > 0) { logger.info(`Table parse: ${tableItems.length} items`, { chain: this.chainName }); return tableItems; }
    const bodyItems = await this._parseBodyText();
    if (bodyItems.length > 0) return bodyItems;
    logger.warn(`Falling back to ${KNOWN_ITEMS.length} known items`, { chain: this.chainName });
    return KNOWN_ITEMS;
  }
  async _parseTable() {
    const data = await this.page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('table'));
      if (!tables.length) return null;
      const best = tables.reduce((a,b) => b.querySelectorAll('tr').length > a.querySelectorAll('tr').length ? b : a);
      const rows = Array.from(best.querySelectorAll('tr'));
      if (rows.length < 2) return null;
      const headers = Array.from(rows[0].querySelectorAll('th,td')).map(c=>(c.innerText||'').trim().toLowerCase());
      const items = []; let cat = 'Breakfast';
      for (let i = 1; i < rows.length; i++) {
        const cells = Array.from(rows[i].querySelectorAll('td,th'));
        if (!cells.length) continue;
        const name = (cells[0].innerText||'').trim(); if (!name) continue;
        if (cells.length <= 1) { cat = name; continue; }
        const values = cells.slice(1).map(cell => {
          const txt=(cell.innerText||'').trim().toLowerCase();
          const icon=!!(cell.querySelector('img,svg,[class*="check"],[class*="icon"]'));
          const aria=(cell.getAttribute('aria-label')||'').toLowerCase();
          return (icon||aria.includes('yes')||aria.includes('contain')||(txt&&txt!=='-'&&txt!=='n/a'&&txt!=='no'&&txt.length<6))?'present':'';
        });
        items.push({ name, category: cat, _values: values });
      }
      return { headers, items };
    });
    if (!data||!data.items.length) return [];
    this._headers = data.headers; return data.items;
  }
  async _parseBodyText() {
    const body = await this.page.innerText('body').catch(()=>'');
    const lines = body.split('\n').map(l=>l.trim()).filter(Boolean);
    const items = []; let cat = 'Breakfast'; const seen = new Set();
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (line.length < 50 && /^[A-Z][A-Z\s&\-\/]+$/.test(line)) { cat = line; continue; }
      if (lower.includes('contains')&&(lower.includes('milk')||lower.includes('wheat')||lower.includes('soy')||lower.includes('egg')||lower.includes('sesame')))
        { const name = line.slice(0,80); if (!seen.has(name)) { seen.add(name); items.push({ name, category: cat, _rawText: line }); } }
    }
    logger.info(`Body text: ${items.length} items`, { chain: this.chainName }); return items;
  }
  async extractAllergens(item) {
    const row = makeEmptyRow();
    row.menuCategory = item.category; row.itemName = item.name;
    row.sourceUrl = OFFICIAL_URL; row.scrapeDate = new Date().toISOString();
    if (item._rawText) { Object.assign(row, this.parseAllergenText(item._rawText)); if (ALLERGENS.some(a=>row[a]==='TRUE')) return row; }
    if (item._values && this._headers) {
      const present = []; let anyMapped = false;
      this._headers.forEach((header,i) => { const key=COLUMN_MAP[header]; if (!key) return; const isPresent=item._values[i-1]==='present'; if (isPresent) present.push(header); row[key]=isPresent?'TRUE':'FALSE'; anyMapped=true; });
      if (anyMapped) { row.confidence='HIGH'; row.crossContact='NO'; row.sourceText=present.length>0?`Contains: ${present.join(', ')}`:'No allergens listed'; return row; }
    }
    for (const a of ALLERGENS) row[a]='COULD_NOT_VERIFY';
    row.crossContact='COULD_NOT_VERIFY'; row.confidence='COULD_NOT_VERIFY';
    row.sourceText=`Allergen data not accessible — check ${OFFICIAL_URL}`;
    return row;
  }
}
module.exports = BobEvans;
