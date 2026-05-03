'use strict';

/**
 * McDonald's Allergen Scraper
 *
 * Strategy: category pages → individual product pages.
 * The nutrition calculator URL (/nutritioncalculator.html) is periodically
 * down for maintenance. The category + product pages are always live and
 * each product page carries its own allergen disclosure section.
 *
 * Flow:
 *   1. discoverMenuItems() — visit each category page, collect all /product/ links
 *   2. scrape() override   — for each product URL, load the page and read allergens
 *
 * Rate limiting: Bottleneck at 1 request / 3s to avoid IP blocking.
 */

const BaseScraper  = require('./BaseScraper');
const Bottleneck   = require('bottleneck');
const { logger }   = require('../utils/logger');
const { makeEmptyRow, ALLERGENS } = require('../output/schema');

const OFFICIAL_URL = 'https://www.mcdonalds.com/us/en-us/about-our-food/nutritioncalculator.html';

// All category pages derived from McDonald's main navigation
const CATEGORY_PAGES = [
  { name: 'Breakfast',                  url: 'https://www.mcdonalds.com/us/en-us/full-menu/breakfast.html' },
  { name: 'Burgers',                    url: 'https://www.mcdonalds.com/us/en-us/full-menu/burgers.html' },
  { name: 'Chicken & Fish Sandwiches',  url: 'https://www.mcdonalds.com/us/en-us/full-menu/chicken-and-fish-sandwiches.html' },
  { name: 'McNuggets & Strips',         url: 'https://www.mcdonalds.com/us/en-us/full-menu/mcnuggets-and-mccrispy-strips.html' },
  { name: 'Snack Wraps',                url: 'https://www.mcdonalds.com/us/en-us/full-menu/snack-wrap.html' },
  { name: 'Fries & Sides',              url: 'https://www.mcdonalds.com/us/en-us/full-menu/fries-sides.html' },
  { name: 'Happy Meal',                 url: 'https://www.mcdonalds.com/us/en-us/full-menu/happy-meal.html' },
  { name: 'Sweets & Treats',            url: 'https://www.mcdonalds.com/us/en-us/full-menu/sweets-treats.html' },
  { name: 'McCafé Coffees',             url: 'https://www.mcdonalds.com/us/en-us/full-menu/mccafe-coffees.html' },
  { name: 'Beverages',                  url: 'https://www.mcdonalds.com/us/en-us/full-menu/drinks.html' },
  { name: 'Sauces & Condiments',        url: 'https://www.mcdonalds.com/us/en-us/full-menu/sauces-and-condiments.html' },
  { name: 'Extra Value Meals',          url: 'https://www.mcdonalds.com/us/en-us/full-menu/extra-value-meals-menu.html' },
  { name: 'McValue',                    url: 'https://www.mcdonalds.com/us/en-us/full-menu/mcvalue-menu.html' },
];

// Selectors for allergen text on product pages
// McDonald's product pages embed allergen data in one of these patterns:
const ALLERGEN_SELECTORS = [
  '.cmp-nutrition-ingredient__information',
  '.cmp-nutrition-details__allergens',
  '[class*="allergen"]',
  '[class*="Allergen"]',
  '[class*="ingredient"]',
  // Fallback: any element whose text starts with "Contains"
  // (handled via body-text regex below)
];

// Selectors for the item name on a product page
const ITEM_NAME_SELECTORS = [
  'h1',
  '.cmp-product-details__name',
  '[class*="product-title"]',
  '[class*="ProductTitle"]',
  '[class*="item-title"]',
];

// Selector for product links on category pages
const PRODUCT_LINK_SEL = 'a[href*="/product/"]';

class McDonalds extends BaseScraper {
  constructor() {
    super({ chainName: 'McDonalds', officialUrl: OFFICIAL_URL });

    // 1 request per 3 seconds to be polite and avoid IP blocks
    this._limiter = new Bottleneck({ minTime: 3000, maxConcurrent: 1 });
  }

  // ─── Override full scrape() — single browser session, rate-limited ────────
  async scrape() {
    logger.info('Starting scrape (category→product strategy)', { chain: this.chainName });
    this.results = [];
    this.errors  = [];

    // ── Step 1: discover every product URL from category pages ──────────────
    const items = await this.discoverMenuItems();
    if (items.length === 0) {
      logger.error('No product URLs found — site may be in maintenance', { chain: this.chainName });
      return [];
    }

    this._discoveredCount = items.length;
    logger.info(`Discovered ${items.length} items across all categories`, { chain: this.chainName });

    // ── Step 2: for each product page, extract allergens ────────────────────
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      logger.info(`[${i + 1}/${items.length}] Extracting: ${item.name} (${item.category})`, { chain: this.chainName });

      const row = await this._limiter.schedule(() => this._scrapeProductPage(item));
      row.rowNum = this.results.length + 1;
      this.validateRow(row);
      this.results.push(row);
    }

    logger.info(`Scrape complete — ${this.results.length} rows`, { chain: this.chainName });
    return this.results;
  }

  // ─── discoverMenuItems — visit every category page, collect product URLs ──
  async discoverMenuItems() {
    const items     = [];
    const seenUrls  = new Set();

    for (const category of CATEGORY_PAGES) {
      logger.info(`Scanning category: ${category.name}`, { chain: this.chainName });

      const ok = await this.navigateTo(category.url);
      if (!ok) {
        logger.warn(`Could not load category "${category.name}" — skipping`, { chain: this.chainName });
        continue;
      }

      await this.page.waitForTimeout(2000);
      await this.takeScreenshot(`category-${category.name.replace(/[^a-zA-Z0-9]/g, '_')}`);

      // Collect all product page links on this category page
      let productLinks = [];
      try {
        productLinks = await this.page.$$eval(PRODUCT_LINK_SEL, els =>
          [...new Set(els.map(e => e.href).filter(h => h.includes('/product/')))]
        );
      } catch (err) {
        logger.warn(`Could not collect product links on "${category.name}": ${err.message}`, { chain: this.chainName });
      }

      // Also look for category sub-listing links (some categories have sub-categories)
      // Filter against known URLs in Node scope (page context can't see module-level vars)
      const knownUrls = new Set(CATEGORY_PAGES.map(c => c.url));
      let subCatLinks = [];
      try {
        const rawSubLinks = await this.page.$$eval('a[href*="/full-menu/"]', els =>
          [...new Set(els.map(e => e.href))]
        );
        subCatLinks = rawSubLinks.filter(h => !knownUrls.has(h));
      } catch { /* ok */ }

      // Visit sub-category pages and collect their products too
      for (const subUrl of subCatLinks.slice(0, 8)) { // cap sub-pages per category
        const subOk = await this._limiter.schedule(() => this.navigateTo(subUrl));
        if (!subOk) continue;
        await this.page.waitForTimeout(1500);
        try {
          const subLinks = await this.page.$$eval(PRODUCT_LINK_SEL, els =>
            [...new Set(els.map(e => e.href).filter(h => h.includes('/product/')))]
          );
          productLinks.push(...subLinks);
        } catch { /* skip */ }
      }

      // Extra depth pass: if still no products found, broaden selectors and
      // follow one more level of sub-page links (handles Happy Meal, Extra Value Meals)
      if (productLinks.length === 0) {
        logger.info(`  Zero products on "${category.name}" — attempting deeper traversal`, { chain: this.chainName });

        // Broader product-link patterns used by nested category pages
        const broaderSels = [
          'a[href*="/product/"]',
          'a[href*="/menu-item/"]',
          'a[class*="product"]',
          '[data-testid*="product"] a',
          '.category-page__item a',
          '.cmp-category-item a',
        ];

        // Re-collect any sub-page links we might have missed (deeper paths)
        // Note: filter against known category URLs in Node scope, not inside page context
        const knownCategoryUrls = new Set(CATEGORY_PAGES.map(c => c.url));
        let deepSubLinks = [];
        try {
          const allMenuLinks = await this.page.$$eval('a[href*="/full-menu/"], a[href*="/category/"]', els =>
            [...new Set(els.map(e => e.href))]
          );
          deepSubLinks = allMenuLinks.filter(h => !knownCategoryUrls.has(h));
        } catch { /* ok */ }

        for (const deepUrl of deepSubLinks.slice(0, 12)) {
          const deepOk = await this._limiter.schedule(() => this.navigateTo(deepUrl));
          if (!deepOk) continue;
          await this.page.waitForTimeout(1500);

          for (const sel of broaderSels) {
            try {
              const found = await this.page.$$eval(sel, els =>
                [...new Set(els.map(e => e.href).filter(h => h && h.includes('/product/')))]
              );
              productLinks.push(...found);
            } catch { /* try next */ }
          }
          if (productLinks.length > 0) break;
        }

        // Last resort: look for any /product/ href on the original category page DOM
        if (productLinks.length === 0) {
          try {
            const allHrefs = await this.page.$$eval('a[href]', els =>
              els.map(e => e.href).filter(h => h && h.includes('/product/'))
            );
            productLinks.push(...allHrefs);
          } catch { /* ok */ }
        }
      }

      // Deduplicate and collect
      for (const href of productLinks) {
        if (seenUrls.has(href)) continue;
        seenUrls.add(href);

        // Derive item name from URL slug (will be overwritten by page title on product page)
        const slug = href.split('/product/').pop().replace('.html', '').replace(/-/g, ' ');
        const name = slug.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        items.push({ category: category.name, name, productUrl: href });
      }

      logger.info(`  → ${productLinks.length} products in "${category.name}" (total so far: ${items.length})`, { chain: this.chainName });

      // Polite delay between category pages
      await this.page.waitForTimeout(1000);
    }

    return items;
  }

  // ─── Normalise a product URL that may have accent chars stripped ──────────
  _normaliseProductUrl(url) {
    // McDonald's category pages strip 'é' to nothing, producing slugs like
    // /mccaf-mocha-small.html instead of /mccafe-mocha-small.html
    return url.replace(/\/mccaf-/g, '/mccafe-');
  }

  // ─── Visit a product page and extract allergen data ───────────────────────
  async _scrapeProductPage(item) {
    const row = makeEmptyRow();
    row.menuCategory = item.category;
    row.itemName     = item.name;
    row.sourceUrl    = item.productUrl;
    row.scrapeDate   = new Date().toISOString();

    // Try the normalised URL first; fall back to raw URL on failure
    const normalised = this._normaliseProductUrl(item.productUrl);
    let targetUrl = normalised;
    let ok = await this.navigateTo(normalised);
    if (!ok && normalised !== item.productUrl) {
      logger.warn(`Normalised URL failed, retrying with original: ${item.productUrl}`, { chain: this.chainName });
      ok = await this.navigateTo(item.productUrl);
      targetUrl = item.productUrl;
    }
    row.sourceUrl = targetUrl;
    if (!ok) {
      return this.buildCNVRow(item.category, item.name, targetUrl,
        `Page load failed for product URL: ${targetUrl}`);
    }

    await this.page.waitForTimeout(1500);

    // Override name with actual page heading (more accurate than URL slug)
    for (const sel of ITEM_NAME_SELECTORS) {
      try {
        const el   = await this.page.$(sel);
        if (!el) continue;
        const text = (await el.innerText()).trim();
        if (text && text.length > 1 && text.length < 120) {
          row.itemName = text;
          break;
        }
      } catch { /* try next */ }
    }

    const screenshotPath = await this.takeScreenshot(
      row.itemName.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 60)
    );

    // ── Read allergen info ─────────────────────────────────────────────────
    let containsText   = '';
    let mayContainText = '';
    let foundAllergen  = false;

    // Strategy 1: labelled allergen elements
    for (const sel of ALLERGEN_SELECTORS) {
      try {
        const els = await this.page.$$(sel);
        for (const el of els) {
          const text = (await el.innerText()).trim();
          if (!text || text.length < 4) continue;
          const lower = text.toLowerCase();
          if (lower.includes('contain') || lower.includes('allergen') ||
              lower.includes('milk') || lower.includes('wheat') || lower.includes('soy')) {
            foundAllergen = true;
            if (lower.includes('may contain')) {
              const parts    = text.split(/may contain/i);
              containsText   = parts[0].replace(/contains?:?\s*/i, '').trim();
              mayContainText = parts[1] ? parts[1].replace(/^[:\s]+/, '').trim() : '';
            } else {
              containsText = text.replace(/contains?:?\s*/i, '').trim();
            }
            logger.debug(`Allergen text found via "${sel}"`, { chain: this.chainName, item: row.itemName });
            break;
          }
        }
        if (foundAllergen) break;
      } catch { /* try next */ }
    }

    // Strategy 2: full body text regex scan
    if (!foundAllergen) {
      try {
        const bodyText = await this.page.innerText('body');
        const cm  = bodyText.match(/Contains?:?\s*([^\n.]{3,300})/i);
        const mcm = bodyText.match(/May\s+Contain?:?\s*([^\n.]{3,300})/i);
        if (cm || mcm) {
          foundAllergen  = true;
          containsText   = cm  ? cm[1].trim()  : '';
          mayContainText = mcm ? mcm[1].trim() : '';
          logger.debug('Allergen text found via body regex', { chain: this.chainName, item: row.itemName });
        }
      } catch { /* ignore */ }
    }

    if (!foundAllergen) {
      logger.warn(`No allergen section found for "${row.itemName}" — all CNV`, { chain: this.chainName });
      for (const a of ALLERGENS) row[a] = 'COULD_NOT_VERIFY';
      row.crossContact = 'COULD_NOT_VERIFY';
      row.confidence   = 'COULD_NOT_VERIFY';
      row.sourceText   = `No allergen section found on ${item.productUrl}`;
    } else {
      const parsed = this.parseAllergenText(containsText, mayContainText);
      Object.assign(row, parsed);
    }

    if (screenshotPath) {
      row.sourceText = (row.sourceText || '') + ` | screenshot:${screenshotPath}`;
    }

    return row;
  }

  async extractAllergens() { return null; } // unused — scrape() is overridden
}

module.exports = McDonalds;
