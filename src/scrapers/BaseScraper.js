'use strict';

const { chromium } = require('playwright');
const { logger } = require('../utils/logger');
const { saveScreenshot } = require('../utils/screenshot');
const { ALLERGENS, ALLERGEN_KEYWORDS, VALID_VALUES, makeEmptyRow } = require('../output/schema');

const CNV = 'COULD_NOT_VERIFY';
const PAGE_TIMEOUT_MS = 90_000;   // McDonald's and other SPAs take 60-90s to hydrate
const RATE_LIMIT_WAIT_MS = 60_000;

class BaseScraper {
  constructor({ chainName, officialUrl }) {
    if (!chainName || !officialUrl) {
      throw new Error('BaseScraper requires chainName and officialUrl');
    }
    this.chainName  = chainName;
    this.officialUrl = officialUrl;  // always hardcoded in subclass
    this.browser    = null;
    this.context    = null;
    this.page       = null;
    this.results    = [];
    this.errors     = [];
    this._discoveredCount = 0;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async init() {
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-http2',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--lang=en-US,en',
      ],
    });
    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.201 Safari/537.36',
      viewport: { width: 1440, height: 900 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
      },
    });
    // Remove the webdriver flag that sites use to detect headless browsers
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(PAGE_TIMEOUT_MS);
    this.page.setDefaultNavigationTimeout(PAGE_TIMEOUT_MS);

    // Intercept 429 responses
    this.page.on('response', async (response) => {
      if (response.status() === 429) {
        logger.warn('Rate limited (429) — will retry after wait', { chain: this.chainName });
        this._rateLimited = true;
      }
    });

    logger.info(`Browser initialised`, { chain: this.chainName });
  }

  async close() {
    try {
      if (this.browser) await this.browser.close();
    } catch { /* ignore */ }
    this.browser  = null;
    this.context  = null;
    this.page     = null;
  }

  // ─── Navigation ───────────────────────────────────────────────────────────

  async navigateTo(url) {
    // Try domcontentloaded first; fall back to load on HTTP/2 protocol errors
    const strategies = ['domcontentloaded', 'load'];
    let response = null;

    for (const waitUntil of strategies) {
      try {
        response = await this.page.goto(url, { waitUntil, timeout: PAGE_TIMEOUT_MS });
        break;
      } catch (err) {
        const isProtocolErr = err.message.includes('ERR_HTTP2') ||
                              err.message.includes('PROTOCOL_ERROR') ||
                              err.message.includes('ERR_CONNECTION_CLOSED');
        const isTimeout = err.name === 'TimeoutError' || err.message.includes('timeout');

        if (isProtocolErr && waitUntil !== strategies[strategies.length - 1]) {
          logger.warn(`Protocol error (${waitUntil}), retrying with next load strategy`, { chain: this.chainName });
          await this.page.waitForTimeout(2000);
          continue;
        }
        if (isTimeout) {
          logger.error(`Page timeout after ${PAGE_TIMEOUT_MS / 1000}s`, { chain: this.chainName, url });
          return false;
        }
        logger.error(`Navigation error: ${err.message}`, { chain: this.chainName, url });
        return false;
      }
    }

    if (response && response.status() === 429) {
      logger.warn('Rate limited (429) — waiting 60 s then retrying', { chain: this.chainName, url });
      await this.page.waitForTimeout(RATE_LIMIT_WAIT_MS);
      try {
        response = await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
      } catch { /* fall through */ }
      if (!response || response.status() === 429) {
        logger.error('Still rate limited after retry', { chain: this.chainName, url });
        return false;
      }
    }

    if (await this._detectLoginWall()) {
      logger.error('ACCESS_BLOCKED — login wall detected', { chain: this.chainName, url });
      return 'ACCESS_BLOCKED';
    }

    return true;
  }

  async _detectLoginWall() {
    try {
      const text = (await this.page.innerText('body')).toLowerCase();
      const triggers = ['sign in to continue', 'log in to continue', 'please log in', 'please sign in', 'create an account to'];
      return triggers.some(t => text.includes(t));
    } catch {
      return false;
    }
  }

  // ─── Screenshots ──────────────────────────────────────────────────────────

  async takeScreenshot(label) {
    const screenshotPath = await saveScreenshot(this.page, this.chainName, label);
    if (screenshotPath) {
      logger.debug(`Screenshot saved: ${screenshotPath}`, { chain: this.chainName });
    }
    return screenshotPath;
  }

  // ─── Allergen parsing helpers ─────────────────────────────────────────────

  /**
   * Given raw source text from a page, map it to all 9 allergen values.
   * containsText — the "Contains:" block text
   * mayContainText — the "May Contain:" block text (optional)
   * Returns { milk, eggs, fish, shellfish, treeNuts, peanuts, wheat, soy, sesame,
   *           crossContact, confidence, sourceText }
   */
  parseAllergenText(containsText, mayContainText = '') {
    const containsLower    = containsText.toLowerCase();
    const mayContainLower  = mayContainText.toLowerCase();

    // Extract just the "Contains:" disclosure line if it's buried in a larger block
    const containsLine = containsText.match(/contains?:?\s*([^\n.]{3,300})/i);
    const mayLine      = mayContainText.match(/may\s+contain?:?\s*([^\n.]{3,300})/i)
                      || (mayContainText.length < 300 ? [null, mayContainText] : null);
    const sourceText = [
      containsLine  ? `Contains: ${containsLine[1].trim()}`  : (containsText.slice(0,200)  || ''),
      mayLine       ? `May Contain: ${mayLine[1].trim()}`    : (mayContainText.slice(0,200) || ''),
    ].filter(Boolean).join(' | ');

    const result = { crossContact: 'NO', confidence: 'HIGH', sourceText };

    for (const allergen of ALLERGENS) {
      const keywords = ALLERGEN_KEYWORDS[allergen];
      const inContains   = keywords.some(k => containsLower.includes(k));
      const inMayContain = keywords.some(k => mayContainLower.includes(k));

      if (inContains) {
        result[allergen] = 'TRUE';
      } else if (inMayContain) {
        result[allergen]    = 'TRUE';
        result.crossContact = 'YES';
        result.confidence   = 'LOW';
      } else {
        result[allergen] = 'FALSE';
      }

      logger.debug('Allergen mapped', {
        chain: this.chainName,
        allergen,
        value: result[allergen],
        sourceText: sourceText.slice(0, 120),
      });
    }

    return result;
  }

  /**
   * Build a CNV row for when extraction completely fails.
   */
  buildCNVRow(category, itemName, sourceUrl, reason) {
    const row = makeEmptyRow();
    row.menuCategory = category || CNV;
    row.itemName     = itemName  || CNV;
    row.sourceUrl    = sourceUrl || CNV;
    row.sourceText   = reason    || 'Extraction failed';
    row.scrapeDate   = new Date().toISOString();
    this.errors.push({ itemName, reason });
    logger.warn(`CNV row: ${reason}`, { chain: this.chainName, item: itemName });
    return row;
  }

  /**
   * Validate a completed row — all allergen fields must be in VALID_VALUES.
   * Overwrites any bad value with CNV and logs an error.
   */
  validateRow(row) {
    for (const allergen of ALLERGENS) {
      if (!VALID_VALUES.has(row[allergen])) {
        logger.error(`Invalid allergen value "${row[allergen]}" for ${allergen} — overwriting with CNV`, {
          chain: this.chainName, item: row.itemName,
        });
        row[allergen] = CNV;
        row.confidence = CNV;
      }
    }
    if (!['YES', 'NO', CNV].includes(row.crossContact)) {
      row.crossContact = CNV;
    }
    return row;
  }

  // ─── Abstract interface — subclasses must implement ───────────────────────

  /**
   * Discover every menu item on the chain's website.
   * Must return: Array<{ category: string, name: string, detailUrl?: string }>
   */
  async discoverMenuItems() {
    throw new Error(`${this.chainName}.discoverMenuItems() not implemented`);
  }

  /**
   * Extract allergen data for a single discovered item.
   * Must return a row object matching the schema.
   */
  async extractAllergens(/* item */) {
    throw new Error(`${this.chainName}.extractAllergens() not implemented`);
  }

  // ─── Top-level scrape orchestration ──────────────────────────────────────

  async scrape() {
    logger.info(`Starting scrape`, { chain: this.chainName, url: this.officialUrl });
    this.results = [];
    this.errors  = [];

    let items = [];
    try {
      items = await this.discoverMenuItems();
      this._discoveredCount = items.length;
      logger.info(`Discovered ${items.length} menu items`, { chain: this.chainName });
    } catch (err) {
      logger.error(`discoverMenuItems failed: ${err.message}`, { chain: this.chainName, stack: err.stack });
      return [];
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      logger.info(`Extracting allergens [${i + 1}/${items.length}]: ${item.name}`, { chain: this.chainName });
      let row;
      try {
        row = await this.extractAllergens(item);
        if (!row) {
          row = this.buildCNVRow(item.category, item.name, this.officialUrl, 'extractAllergens returned null');
        }
      } catch (err) {
        row = this.buildCNVRow(item.category, item.name, this.officialUrl, `Exception: ${err.message}`);
      }
      row.rowNum = this.results.length + 1;
      this.validateRow(row);
      this.results.push(row);
    }

    logger.info(`Scrape complete — ${this.results.length} rows`, { chain: this.chainName });
    return this.results;
  }
}

module.exports = BaseScraper;
