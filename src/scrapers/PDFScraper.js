'use strict';

/**
 * PDFScraper — download a restaurant's allergen PDF and parse the allergen table.
 *
 * Download strategy:
 *   1. Direct HTTPS fetch with browser-like headers
 *   2. On 403/404/error: Playwright headless browser download (intercept response)
 *
 * Parsing strategy (in priority order):
 *   1. "Contains:" inline text per item  — e.g. "Item Name Contains: Milk, Wheat"
 *   2. Tab/space-delimited table         — item name [tab] YES/NO per column
 *   3. X-matrix per section              — "ItemName" then "X" on next line (Wingstop style)
 *   4. Returns CNV rows if nothing parsed, with PDF path for manual review
 *
 * Note: Dot-matrix PDFs (FiveGuys ●● format) lose column position info during
 * text extraction. Items are extracted but allergen columns cannot be reliably
 * mapped — confidence=LOW, sourceText notes the limitation.
 */

const fs   = require('fs');
const path = require('path');
const { makeEmptyRow, ALLERGENS } = require('../output/schema');
const { logger } = require('../utils/logger');

const FETCH_HEADERS = {
  'User-Agent':         'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':             'application/pdf,*/*;q=0.8',
  'Accept-Language':    'en-US,en;q=0.9',
  'Accept-Encoding':    'identity',
  'Connection':         'keep-alive',
  'Cache-Control':      'no-cache',
  'Pragma':             'no-cache',
};

const HEADER_MAP = {
  'milk':        'milk',
  'dairy':       'milk',
  'egg':         'eggs',
  'eggs':        'eggs',
  'fish':        'fish',
  'shellfish':   'shellfish',
  'crustacean':  'shellfish',
  'tree nut':    'treeNuts',
  'tree nuts':   'treeNuts',
  'treenut':     'treeNuts',
  'peanut':      'peanuts',
  'peanuts':     'peanuts',
  'wheat':       'wheat',
  'gluten':      'wheat',
  'soy':         'soy',
  'soybean':     'soy',
  'soybeans':    'soy',
  'sesame':      'sesame',
};

class PDFScraper {
  constructor({ chainName, pdfUrl, officialUrl }) {
    this.chainName   = chainName;
    this.pdfUrl      = pdfUrl;
    this.officialUrl = officialUrl || pdfUrl;
    this.results     = [];
    this.errors      = [];
  }

  async scrape() {
    logger.info(`PDFScraper starting`, { chain: this.chainName, url: this.pdfUrl });

    const pdfBuffer = await this._downloadPDF();
    if (!pdfBuffer) {
      logger.error(`PDF download failed (all methods)`, { chain: this.chainName });
      return [];
    }

    const text = await this._extractText(pdfBuffer);
    if (!text || text.trim().length < 10) {
      logger.error(`PDF text extraction failed or empty`, { chain: this.chainName });
      return [];
    }

    logger.info(`PDF text extracted: ${text.length} chars`, { chain: this.chainName });

    const rows = this._parseText(text);
    logger.info(`Parsed ${rows.length} rows from PDF`, { chain: this.chainName });
    this.results = rows;
    return rows;
  }

  // ── Download methods ──────────────────────────────────────────────────────

  async _downloadPDF() {
    // First try direct HTTP
    const buf = await this._downloadDirect(this.pdfUrl);
    if (buf) return buf;

    // Fallback: Playwright browser download
    logger.info(`Direct download failed — trying Playwright`, { chain: this.chainName });
    return await this._downloadViaPlaywright(this.pdfUrl);
  }

  async _downloadDirect(url, maxRedirects = 3) {
    if (maxRedirects <= 0) return null;
    try {
      const https   = require('https');
      const http    = require('http');
      const { URL } = require('url');

      const parsed   = new URL(url);
      const protocol = parsed.protocol === 'https:' ? https : http;

      const dir      = path.join('screenshots', this.chainName);
      fs.mkdirSync(dir, { recursive: true });
      const savePath = path.join(dir, 'allergen-source.pdf');

      const referer = `${parsed.protocol}//${parsed.hostname}/`;

      return await new Promise((resolve, reject) => {
        const options = {
          hostname: parsed.hostname,
          path:     parsed.pathname + (parsed.search || ''),
          method:   'GET',
          headers:  { ...FETCH_HEADERS, 'Referer': referer },
          timeout:  30000,
        };

        const req = protocol.request(options, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const next = res.headers.location.startsWith('http')
              ? res.headers.location
              : `${parsed.protocol}//${parsed.hostname}${res.headers.location}`;
            logger.info(`Redirect (${res.statusCode}) → ${next.slice(0, 80)}`, { chain: this.chainName });
            res.destroy();
            resolve(this._downloadDirect(next, maxRedirects - 1));
            return;
          }
          if (res.statusCode !== 200) {
            res.destroy();
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          const ct = res.headers['content-type'] || '';
          if (ct.includes('text/html') && !ct.includes('pdf')) {
            res.destroy();
            reject(new Error(`Got HTML instead of PDF (content-type: ${ct})`));
            return;
          }
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => {
            const buf = Buffer.concat(chunks);
            if (buf.length < 200) { reject(new Error(`Too small: ${buf.length} bytes`)); return; }
            // Quick PDF magic number check (%PDF)
            if (!buf.slice(0, 5).toString().includes('%PDF')) {
              reject(new Error('Not a PDF (missing %PDF header)'));
              return;
            }
            fs.writeFileSync(savePath, buf);
            logger.info(`PDF saved: ${savePath} (${buf.length} bytes)`, { chain: this.chainName });
            resolve(buf);
          });
          res.on('error', reject);
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.end();
      });

    } catch (err) {
      logger.warn(`Direct download error: ${err.message}`, { chain: this.chainName });
      return null;
    }
  }

  async _downloadViaPlaywright(url) {
    let browser = null;
    try {
      const { chromium } = require('playwright');
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const context = await browser.newContext({
        userAgent: FETCH_HEADERS['User-Agent'],
        acceptDownloads: true,
      });
      const page = await context.newPage();

      const dir      = path.join('screenshots', this.chainName);
      fs.mkdirSync(dir, { recursive: true });
      const savePath = path.join(dir, 'allergen-source.pdf');

      // Intercept the PDF response
      let pdfBuf = null;
      page.on('response', async (response) => {
        const u  = response.url();
        const ct = response.headers()['content-type'] || '';
        if (u.includes('pdf') || ct.includes('pdf') || ct.includes('octet')) {
          try {
            const body = await response.body();
            if (body && body.length > 200 && body.slice(0, 5).toString().includes('%PDF')) {
              pdfBuf = body;
            }
          } catch { /* ok */ }
        }
      });

      // Also try download event
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
        page.goto(url, { timeout: 30000, waitUntil: 'networkidle' }).catch(() => null),
      ]);

      if (download) {
        const tempPath = await download.path();
        if (tempPath) {
          const buf = fs.readFileSync(tempPath);
          if (buf.length > 200 && buf.slice(0, 5).toString().includes('%PDF')) {
            fs.writeFileSync(savePath, buf);
            logger.info(`PDF saved via download event: ${savePath} (${buf.length} bytes)`, { chain: this.chainName });
            return buf;
          }
        }
      }

      if (pdfBuf) {
        fs.writeFileSync(savePath, pdfBuf);
        logger.info(`PDF saved via response intercept: ${savePath} (${pdfBuf.length} bytes)`, { chain: this.chainName });
        return pdfBuf;
      }

      // Last resort: evaluate fetch in browser context
      const b64 = await page.evaluate(async (pdfUrl) => {
        try {
          const r = await fetch(pdfUrl, { credentials: 'include' });
          if (!r.ok) return null;
          const ab  = await r.arrayBuffer();
          const u8  = new Uint8Array(ab);
          let bin = '';
          u8.forEach(b => { bin += String.fromCharCode(b); });
          return btoa(bin);
        } catch { return null; }
      }, url).catch(() => null);

      if (b64) {
        const buf = Buffer.from(b64, 'base64');
        if (buf.length > 200 && buf.slice(0, 5).toString().includes('%PDF')) {
          fs.writeFileSync(savePath, buf);
          logger.info(`PDF saved via browser fetch: ${savePath} (${buf.length} bytes)`, { chain: this.chainName });
          return buf;
        }
      }

      logger.warn(`Playwright download yielded no PDF`, { chain: this.chainName });
      return null;

    } catch (err) {
      logger.error(`Playwright download error: ${err.message}`, { chain: this.chainName });
      return null;
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  // ── Text extraction ───────────────────────────────────────────────────────

  async _extractText(pdfBuffer) {
    try {
      const pdfParse = require('pdf-parse');
      const data     = await pdfParse(pdfBuffer);
      return data.text || '';
    } catch (err) {
      logger.error(`pdf-parse error: ${err.message}`, { chain: this.chainName });
      return null;
    }
  }

  // ── Parsing strategies ────────────────────────────────────────────────────

  _parseText(text) {
    // Strategy 1: "Contains:" inline text per item
    const rows1 = this._parseContainsFormat(text);
    if (rows1.length > 0) { logger.info(`Contains-format parse: ${rows1.length} items`, { chain: this.chainName }); return rows1; }

    // Strategy 2: Tab/space-delimited table with YES/NO/X values
    const rows2 = this._parseDelimitedTable(text);
    if (rows2.length > 0) { logger.info(`Delimited table parse: ${rows2.length} items`, { chain: this.chainName }); return rows2; }

    // Strategy 3: Wingstop-style X-matrix (item name + X count on same/next line)
    const rows3 = this._parseXMatrix(text);
    if (rows3.length > 0) { logger.info(`X-matrix parse: ${rows3.length} items`, { chain: this.chainName }); return rows3; }

    // Strategy 4: FiveGuys-style dot matrix (item + numbers, then •• on next line)
    const rows4 = this._parseDotMatrix(text);
    if (rows4.length > 0) { logger.info(`Dot-matrix parse: ${rows4.length} items`, { chain: this.chainName }); return rows4; }

    logger.warn(`No recognizable allergen format in PDF`, { chain: this.chainName });
    return [];
  }

  _parseContainsFormat(text) {
    // Strategy: find clean item name lines followed within 5 lines by "Contains: X, Y"
    // A "clean" item name: no commas, no trailing digits, length 2-80
    const lines     = text.split('\n').map(l => l.trim()).filter(Boolean);
    const results   = [];
    const seenNames = new Set();
    let cat = 'Menu';

    const INGREDIENT_PREFIXES = /^(beef|pork|chicken|water|salt|sugar|milk|cream|cured|made|wheat|corn|potato|tomato|vinegar|oil|high\s|enriched|modified|mono|disodium|natural|artificial|gelatin|xanthan|cellulose|calcium|sodium|potassium|less than|contains \d|2%|<)/i;

    for (let i = 0; i < lines.length; i++) {
      const line  = lines[i];
      const lower = line.toLowerCase();

      // Category header: short ALL-CAPS line
      if (line.length < 60 && /^[A-Z][A-Z\s&\-\/()]+$/.test(line) && !lower.includes('contains')) {
        cat = line.trim(); continue;
      }

      // Detect "Contains:" in this line OR in a following line (within 5)
      let containsLine = null;
      let containsIdx  = -1;

      if (/contains:/i.test(lower)) {
        containsLine = line; containsIdx = i;
      } else {
        for (let j = i + 1; j <= Math.min(i + 5, lines.length - 1); j++) {
          if (/contains:/i.test(lines[j])) {
            containsLine = lines[j]; containsIdx = j; break;
          }
        }
      }
      if (!containsLine) continue;

      // Extract item name: use the current line if it's clean, or the line before the contains line
      let namePart = '';
      if (containsIdx === i) {
        // Contains: is on this same line — extract name before it
        namePart = line.replace(/\s*contains:.*/i, '').trim().replace(/:$/, '').trim();
      } else {
        // Current line i is the item name candidate
        namePart = line.replace(/contains.*/i, '').trim().replace(/:$/, '').trim();
      }

      // Strip trailing ingredient text that's concatenated with item name
      // e.g. "Hamburger Patty100% Beef" → "Hamburger Patty"
      namePart = namePart.replace(/\d{2,}.*$/, '').trim();        // trailing digits + rest
      namePart = namePart.replace(/\s+(Cured|Beef|Pork|Chicken|Water|Salt|Sugar|Enriched|Bleached|Made|Potatoes)\b.*$/i, '').trim();

      // Validate the name: no commas, no trailing digits, no ingredient-list patterns
      if (!namePart || namePart.length < 2 || namePart.length > 80) continue;
      if (namePart.includes(',')) continue;             // ingredient list
      if (/\d{4,}/.test(namePart)) continue;           // nutrition data
      if (INGREDIENT_PREFIXES.test(namePart)) continue; // ingredient fragment
      if (/^(may contain|does not|all of our|according|highly refined)/i.test(namePart)) continue;
      if (seenNames.has(namePart)) continue;

      const containsPart = containsLine.toLowerCase();
      const row = makeEmptyRow();
      row.menuCategory = cat;
      row.itemName     = namePart;
      row.sourceUrl    = this.pdfUrl;
      row.scrapeDate   = new Date().toISOString();

      for (const a of ALLERGENS) row[a] = 'FALSE';
      for (const [token, key] of Object.entries(HEADER_MAP)) {
        if (containsPart.includes(token)) row[key] = 'TRUE';
      }

      // "May contain" → crossContact
      const mayContainLine = (lines[containsIdx + 1] || '').toLowerCase();
      row.crossContact = /may contain/i.test(containsPart + ' ' + mayContainLine) ? 'YES' : 'NO';
      row.confidence   = 'HIGH';
      row.sourceText   = containsLine.trim().slice(0, 200);
      seenNames.add(namePart);
      results.push(row);
    }
    return results;
  }

  _parseDelimitedTable(text) {
    // Looks for rows separated by 2+ spaces or tabs:
    //   Item Name    YES   NO   YES   NO ...
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let headerIdx  = -1;
    let headerKeys = [];

    for (let i = 0; i < lines.length; i++) {
      const lower  = lines[i].toLowerCase();
      const tokens = lines[i].split(/\s{2,}|\t/).map(t => t.trim().toLowerCase()).filter(Boolean);
      const allergenCount = tokens.filter(t => Object.keys(HEADER_MAP).some(k => t.includes(k))).length;
      if (allergenCount >= 4) {
        headerIdx  = i;
        headerKeys = tokens.map(t => {
          for (const [k, v] of Object.entries(HEADER_MAP)) { if (t.includes(k)) return v; }
          return null;
        });
        logger.info(`Delimited header at line ${i}: ${headerKeys.filter(Boolean).join(', ')}`, { chain: this.chainName });
        break;
      }
    }

    if (headerIdx < 0) return [];

    const results = [];
    let cat = 'Menu';
    const seenNames = new Set();

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line   = lines[i];
      const tokens = line.split(/\s{2,}|\t/).map(t => t.trim()).filter(Boolean);
      if (tokens.length < 2) continue;

      const name = tokens[0];
      if (!name || name.length > 80 || name.length < 2) continue;
      if (/^(yes|no|x|–|—|-|\d)$/i.test(name)) continue;
      if (line.length < 50 && /^[A-Z\s&]+$/.test(line)) { cat = line; continue; }
      if (seenNames.has(name)) continue;

      const row = makeEmptyRow();
      row.menuCategory = cat;
      row.itemName     = name;
      row.sourceUrl    = this.pdfUrl;
      row.scrapeDate   = new Date().toISOString();

      let mapped = 0;
      headerKeys.forEach((key, colIdx) => {
        if (!key) return;
        const val = (tokens[colIdx + 1] || '').toLowerCase().trim();
        if (/^(yes|y|x|●|✓|✔|•|\*)$/i.test(val)) { row[key] = 'TRUE'; mapped++; }
        else if (/^(no|n|–|—|-+|○|na)$/i.test(val) || val === '') { row[key] = 'FALSE'; mapped++; }
        else row[key] = 'COULD_NOT_VERIFY';
      });

      for (const a of ALLERGENS) { if (!row[a]) row[a] = 'COULD_NOT_VERIFY'; }
      if (mapped < 3) continue;

      row.crossContact = 'COULD_NOT_VERIFY';
      row.confidence   = mapped >= headerKeys.filter(Boolean).length * 0.7 ? 'HIGH' : 'LOW';
      row.sourceText   = `PDF allergen table — ${this.pdfUrl}`;
      seenNames.add(name);
      results.push(row);
    }

    return results;
  }

  _parseXMatrix(text) {
    // Wingstop-style: each section has a mini-header row with allergen names,
    // then rows like: "Cajun" / "Cajun X" / "CajunX" where X = allergen presence.
    // Column order per section: Wheat, Dairy, Egg, Soy, Fish/Shellfish, (Mustard, Celery)
    // Peanuts and Tree Nuts are FALSE per Wingstop disclaimer.
    const WINGSTOP_COLS = ['wheat', 'milk', 'eggs', 'soy', 'fish', 'shellfish'];

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const results = [];
    const seenNames = new Set();

    // Known flavor names from Wingstop's menu
    const FLAVORS = ['atomic', 'cajun', 'garlic parmesan', 'hawaiian', 'hickory smoked bbq',
      'hot honey rub', 'lemon pepper', 'louisiana rub', 'mango habanero', 'mild',
      'original hot', 'plain', 'spicy korean q', 'lto:', 'citrus mojo', '420 fiery nacho',
      'classic'];

    // Section categories — the PDF has multiple tables for each wing type
    const SECTION_HEADERS = [
      { pattern: /bone.in/i,           cat: 'Bone-in Wings' },
      { pattern: /boneless/i,          cat: 'Boneless Wings' },
      { pattern: /tenders?/i,          cat: 'Chicken Tenders' },
      { pattern: /classic.*boneless/i, cat: 'Classic Boneless' },
      { pattern: /sides?/i,            cat: 'Sides' },
      { pattern: /fries/i,             cat: 'Sides' },
      { pattern: /dips?|sauce/i,       cat: 'Sides' },
    ];

    let currentCat = 'Wings';

    for (let i = 0; i < lines.length; i++) {
      const line  = lines[i];
      const lower = line.toLowerCase().trim();

      // Detect section category from PDF structure
      for (const s of SECTION_HEADERS) {
        if (s.pattern.test(lower)) { currentCat = s.cat; break; }
      }

      // Skip header rows (contain allergen column names)
      if (lower.includes('wheat') || lower.includes('dairy') || lower.includes('egg')) continue;
      if (lower.includes('refined') || lower.includes('peanut oil') || lower.includes('according')) continue;
      if (/^[x\s●•]+$/i.test(lower)) continue; // pure X or dot lines = allergen markers

      // Detect item name: pure text line, possibly ending with X markers
      const nameMatch = line.match(/^([A-Za-z][A-Za-z\s&®\/\-:!0-9.]+?)(X+)?$/);
      if (!nameMatch) continue;

      const itemName = nameMatch[1].trim();
      const xOnLine  = (nameMatch[2] || '').length;

      if (itemName.length < 2 || itemName.length > 60) continue;
      if (/^(x+|yes|no|—|-+)$/i.test(itemName)) continue;

      // Check if the next line is just X markers
      const nextLine = (lines[i + 1] || '').trim();
      const xNext    = nextLine.match(/^[Xx]+$/) ? nextLine.length : 0;

      const totalX = xOnLine + xNext;
      if (totalX === 0 && FLAVORS.every(f => !lower.includes(f))) continue;

      const key = `${currentCat}|${itemName}`;
      if (seenNames.has(key)) continue;

      const row = makeEmptyRow();
      row.menuCategory = currentCat;
      row.itemName     = itemName;
      row.sourceUrl    = this.pdfUrl;
      row.scrapeDate   = new Date().toISOString();

      // Map X count to first N columns (Wheat, Dairy, Egg, Soy, Fish, Shellfish)
      // Non-present columns = FALSE; Peanuts/TreeNuts = FALSE per disclaimer
      for (const a of ALLERGENS) row[a] = 'FALSE';
      for (let col = 0; col < Math.min(totalX, WINGSTOP_COLS.length); col++) {
        row[WINGSTOP_COLS[col]] = 'TRUE';
      }

      row.crossContact = 'COULD_NOT_VERIFY';
      row.confidence   = totalX > 0 ? 'LOW' : 'COULD_NOT_VERIFY';
      row.sourceText   = `PDF X-matrix (${totalX} X markers, column order: Wheat/Dairy/Egg/Soy/Fish/Shellfish) — exact mapping uncertain. Peanuts/TreeNuts: FALSE per Wingstop disclaimer.`;
      seenNames.add(key);
      results.push(row);
    }

    return results;
  }

  _parseDotMatrix(text) {
    // FiveGuys-style: item name + numbers on one line, then •• per allergen on next line.
    // Column order: Crustaceans, Shellfish, Eggs, Fish, Gluten/Wheat, Milk, Peanuts, Sesame, Soybeans, Tree Nuts
    // Each marked column = 2 bullet characters (••); absent = 0 characters.
    // Since pdf-parse concatenates them, we can only count total dots → total allergen count.
    // Mark all 9 as CNV but set confidence=LOW and sourceText with the count.

    const FG_COLS = ['shellfish', 'shellfish', 'eggs', 'fish', 'wheat', 'milk', 'peanuts', 'sesame', 'soy', 'treeNuts'];

    const lines   = text.split('\n').map(l => l.trim()).filter(Boolean);
    const results = [];
    const seenNames = new Set();
    let cat = 'Menu';

    for (let i = 0; i < lines.length; i++) {
      const line     = lines[i];
      const nextLine = (lines[i + 1] || '').trim();

      // Category headers: short ALL-CAPS line
      if (/^[A-Z][A-Z\s\-\/()&]+$/.test(line) && line.length < 60) {
        cat = line.trim();
        continue;
      }

      // Skip pure dot or pure number lines
      if (/^[•\s]+$/.test(line) || /^\d+$/.test(line)) continue;

      // Item detection: line starts with a word, ends with many digits (nutrition)
      // Pattern: "Hamburger Patty65302..." — word(s) then digit run
      const itemMatch = line.match(/^([A-Za-z][A-Za-z\s®&().,\/'\-#]+?)\s*(\d{3,}.*)$/);
      if (!itemMatch) continue;

      const itemName = itemMatch[1].trim();
      if (itemName.length < 2 || itemName.length > 80) continue;
      if (seenNames.has(itemName)) continue;

      // Count bullet dots in current and next line
      const dotCount = (line.match(/•/g) || []).length + (nextLine.match(/•/g) || []).length;
      // Each allergen = 2 dots → allergenCount = dotCount / 2
      const allergenCount = Math.round(dotCount / 2);

      const row = makeEmptyRow();
      row.menuCategory = cat;
      row.itemName     = itemName;
      row.sourceUrl    = this.pdfUrl;
      row.scrapeDate   = new Date().toISOString();

      for (const a of ALLERGENS) row[a] = allergenCount === 0 ? 'FALSE' : 'COULD_NOT_VERIFY';
      row.crossContact = 'COULD_NOT_VERIFY';
      row.confidence   = allergenCount === 0 ? 'HIGH' : 'LOW';
      row.sourceText   = allergenCount === 0
        ? `PDF: No allergens indicated`
        : `PDF dot-matrix: ~${allergenCount} allergens present (exact columns lost in text extraction). See ${this.pdfUrl}`;
      seenNames.add(itemName);
      results.push(row);
    }

    return results;
  }
}

module.exports = PDFScraper;
