'use strict';

/**
 * Jimmy John's Allergen Scraper
 *
 * Strategy: The jimmyjohns.com allergen page is a React SPA with PerimeterX
 * bot protection. Allergen data is only available as a downloadable PDF
 * from Contentful CDN (ctfassets.net). We use the PDFScraper module to
 * download and parse the allergen matrix PDF.
 *
 * The footer links include "Allergen Info (PDF)" which points to ctfassets.net.
 * We intercept this link or use known Contentful API to discover the PDF URL.
 *
 * Fallback: comprehensive known-items list with CNV.
 */

const BaseScraper = require('./BaseScraper');
const PDFScraper  = require('./PDFScraper');
const { logger }  = require('../utils/logger');
const { makeEmptyRow, ALLERGENS } = require('../output/schema');

const OFFICIAL_URL = 'https://www.jimmyjohns.com/our-food/allergen-information';

// Jimmy John's publishes allergen PDFs on Contentful CDN
// These are the known patterns — the PDF URL changes periodically
const PDF_SEARCH_URLS = [
  'https://www.jimmyjohns.com/our-food/allergen-information',
  'https://www.jimmyjohns.com',
];

const COLUMN_MAP = {
  'milk':       'milk',
  'dairy':      'milk',
  'egg':        'eggs',
  'eggs':       'eggs',
  'fish':       'fish',
  'shellfish':  'shellfish',
  'tree nut':   'treeNuts',
  'tree nuts':  'treeNuts',
  'peanut':     'peanuts',
  'peanuts':    'peanuts',
  'wheat':      'wheat',
  'gluten':     'wheat',
  'soy':        'soy',
  'soybean':    'soy',
  'sesame':     'sesame',
};

// Comprehensive Jimmy John's menu
const KNOWN_ITEMS = [
  // Original Sandwiches (Cold)
  { name: 'Pepe',                       category: 'Original Sandwiches' },
  { name: 'Big John',                   category: 'Original Sandwiches' },
  { name: 'Totally Tuna',               category: 'Original Sandwiches' },
  { name: 'Turkey Tom',                 category: 'Original Sandwiches' },
  { name: 'Vito',                       category: 'Original Sandwiches' },
  { name: 'The Veggie',                 category: 'Original Sandwiches' },
  // Favorites
  { name: 'Country Club',               category: 'Favorites' },
  { name: 'Beach Club',                 category: 'Favorites' },
  { name: 'Italian Night Club',         category: 'Favorites' },
  { name: 'Hunter\'s Club',             category: 'Favorites' },
  { name: 'Ultimate Porker',            category: 'Favorites' },
  { name: 'J.J.B.L.T.',                 category: 'Favorites' },
  { name: 'Bootlegger Club',            category: 'Favorites' },
  { name: 'Club Lulu',                  category: 'Favorites' },
  { name: 'Club Tuna',                  category: 'Favorites' },
  // Wraps
  { name: 'Unwich Lettuce Wrap',        category: 'Wraps' },
  // Gargantuan
  { name: 'The J.J. Gargantuan',        category: 'Gargantuan' },
  // Sides
  { name: 'Jimmy Chips',                category: 'Sides' },
  { name: 'Jumbo Jimmy Chips',          category: 'Sides' },
  { name: 'Jimmy Chips Jalapeno',       category: 'Sides' },
  { name: 'Jimmy Chips BBQ',            category: 'Sides' },
  { name: 'Cookie',                     category: 'Sides' },
  { name: 'Pickle',                     category: 'Sides' },
  // Plain Slims
  { name: 'Slim 1 Ham & Cheese',        category: 'Plain Slims' },
  { name: 'Slim 2 Roast Beef',          category: 'Plain Slims' },
  { name: 'Slim 3 Tuna Salad',          category: 'Plain Slims' },
  { name: 'Slim 4 Turkey Breast',       category: 'Plain Slims' },
  { name: 'Slim 5 Salami & Capicola',   category: 'Plain Slims' },
  { name: 'Slim 6 Double Provolone',    category: 'Plain Slims' },
  // Bread types
  { name: 'French Bread (8")',           category: 'Bread' },
  { name: 'French Bread (16")',          category: 'Bread' },
  { name: 'Thick-Sliced Wheat Bread',   category: 'Bread' },
];

class JimmyJohns extends BaseScraper {
  constructor() {
    super({ chainName: 'JimmyJohns', officialUrl: OFFICIAL_URL });
    this._headers = null;
    this._pdfRows = null;
  }

  async discoverMenuItems() {
    // Strategy 1: Try to find and download the allergen PDF
    const pdfUrl = await this._findAllergenPdfUrl();
    if (pdfUrl) {
      logger.info(`Found allergen PDF URL: ${pdfUrl}`, { chain: this.chainName });
      const pdfScraper = new PDFScraper({
        chainName: this.chainName,
        pdfUrl,
        officialUrl: OFFICIAL_URL,
      });
      const pdfRows = await pdfScraper.scrape();
      if (pdfRows.length > 0) {
        logger.info(`PDF parse yielded ${pdfRows.length} rows`, { chain: this.chainName });
        this._pdfRows = pdfRows;
        // Return items derived from PDF rows
        return pdfRows.map(r => ({
          name: r.itemName,
          category: r.menuCategory,
          _pdfRow: r,
        }));
      }
    }

    // Strategy 2: Navigate to the page and try to parse
    const ok = await this.navigateTo(OFFICIAL_URL);
    if (ok) {
      // Dismiss popups/cookie banners
      await this._dismissPopups();
      try { await this.page.waitForLoadState('networkidle', { timeout: 25000 }); } catch { /* ok */ }
      await this.page.waitForTimeout(3000);
      await this.takeScreenshot('allergen-page');

      // Try to find PDF links in the footer
      const footerPdfUrl = await this._findPdfLinkInPage();
      if (footerPdfUrl) {
        logger.info(`Found PDF link in page footer: ${footerPdfUrl}`, { chain: this.chainName });
        const pdfScraper = new PDFScraper({
          chainName: this.chainName,
          pdfUrl: footerPdfUrl,
          officialUrl: OFFICIAL_URL,
        });
        const pdfRows = await pdfScraper.scrape();
        if (pdfRows.length > 0) {
          this._pdfRows = pdfRows;
          return pdfRows.map(r => ({
            name: r.itemName,
            category: r.menuCategory,
            _pdfRow: r,
          }));
        }
      }

      // Try body text
      const bodyItems = await this._parseBodyText();
      if (bodyItems.length > 0) return bodyItems;
    }

    // Fallback: known items
    logger.warn(`Falling back to ${KNOWN_ITEMS.length} known items`, { chain: this.chainName });
    return KNOWN_ITEMS;
  }

  async _findAllergenPdfUrl() {
    // Try to discover the PDF URL by navigating to the page and intercepting links
    try {
      const ok = await this.navigateTo(OFFICIAL_URL);
      if (!ok) return null;

      // Dismiss popups first
      await this._dismissPopups();
      await this.page.waitForTimeout(3000);

      return await this._findPdfLinkInPage();
    } catch (err) {
      logger.warn(`PDF URL discovery failed: ${err.message}`, { chain: this.chainName });
      return null;
    }
  }

  async _dismissPopups() {
    try {
      // Close promotional overlays
      const closeBtn = this.page.locator('button[aria-label="Close"], button:has-text("Accept"), .close-button, [class*="close"]').first();
      if (await closeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await closeBtn.click();
        await this.page.waitForTimeout(500);
      }
      // Accept cookies
      const acceptBtn = this.page.locator('button:has-text("Accept All"), button:has-text("Reject Non-essential")').first();
      if (await acceptBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await acceptBtn.click();
        await this.page.waitForTimeout(500);
      }
    } catch { /* ok */ }
  }

  async _findPdfLinkInPage() {
    try {
      const pdfUrl = await this.page.evaluate(() => {
        // Look for links containing "allergen" and "pdf" in href or text
        const allLinks = Array.from(document.querySelectorAll('a[href]'));
        for (const link of allLinks) {
          const href = link.href || '';
          const text = (link.innerText || '').toLowerCase();
          if ((href.includes('allergen') || text.includes('allergen')) &&
              (href.includes('.pdf') || href.includes('ctfassets') || text.includes('pdf'))) {
            return href;
          }
        }
        // Also check footer links
        const footerLinks = Array.from(document.querySelectorAll('footer a[href], [class*="footer"] a[href]'));
        for (const link of footerLinks) {
          const href = link.href || '';
          const text = (link.innerText || '').toLowerCase();
          if (text.includes('allergen') && (href.includes('.pdf') || href.includes('ctfassets'))) {
            return href;
          }
        }
        return null;
      });
      return pdfUrl;
    } catch {
      return null;
    }
  }

  async _parseBodyText() {
    const body  = await this.page.innerText('body').catch(() => '');
    const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
    const items = [];
    let cat = 'Sandwiches';
    const seen = new Set();

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (line.length < 50 && /^[A-Z][A-Z\s&\-\/\d#]+$/.test(line)) { cat = line; continue; }
      if (lower.includes('contains') &&
          (lower.includes('milk') || lower.includes('wheat') || lower.includes('soy') ||
           lower.includes('egg') || lower.includes('sesame'))) {
        const name = line.slice(0, 80);
        if (!seen.has(name)) { seen.add(name); items.push({ name, category: cat, _rawText: line }); }
      }
    }

    logger.info(`Body text fallback: ${items.length} items`, { chain: this.chainName });
    return items;
  }

  async extractAllergens(item) {
    // If we have PDF-parsed data, use it directly
    if (item._pdfRow) {
      return item._pdfRow;
    }

    const row = makeEmptyRow();
    row.menuCategory = item.category;
    row.itemName     = item.name;
    row.sourceUrl    = OFFICIAL_URL;
    row.scrapeDate   = new Date().toISOString();

    if (item._rawText) {
      const parsed = this.parseAllergenText(item._rawText);
      Object.assign(row, parsed);
      return row;
    }

    // CNV fallback for known items
    for (const a of ALLERGENS) row[a] = 'COULD_NOT_VERIFY';
    row.crossContact = 'COULD_NOT_VERIFY';
    row.confidence   = 'COULD_NOT_VERIFY';
    row.sourceText   = 'Allergen data available as PDF from jimmyjohns.com — React SPA with bot protection prevented extraction';
    return row;
  }
}

module.exports = JimmyJohns;
