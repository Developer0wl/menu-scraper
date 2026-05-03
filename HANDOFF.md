# Allerva Scraper — Project Handoff

Last updated: 2026-05-03  
Repository: https://github.com/Developer0wl/menu-scraper

---

## What This Project Does

Scrapes allergen data (TRUE / FALSE / COULD_NOT_VERIFY) for every menu item at 45+ US restaurant chains.  
Output: one Excel file with one sheet per chain, allergen columns D–L (Milk, Eggs, Fish, Shellfish, Tree Nuts, Peanuts, Wheat, Soy, Sesame).

---

## How to Run

```bash
cd allerva-scraper
npm install
npx playwright install chromium

# Single chain
node src/index.js --chain mcdonalds --dry-run

# Batch
node src/index.js --chains tacobell,subway,jimmyjohns

# All 45 chains
node src/index.js --all

# Skip already-scraped chains (uses checkpoints/)
node src/index.js --all --resume

# Write Excel output
node src/index.js --chains chipotle,chickfila
# → output/allerva-YYYYMMDD.xlsx

# PDF extraction test
node run-pdf-test.js
```

---

## Current State (as of 2026-05-03)

### Batch 1 — COMPLETE ✓

| Chain | Rows | Quality | Notes |
|-------|------|---------|-------|
| McDonald's | ~191 | HIGH | Live HTML — nutrition calculator |
| Chipotle | 26 | HIGH | Live table — 3 allergen cols (Dairy, Soy, Gluten); others statically FALSE per disclaimer |
| Chick-fil-A | 161 | HIGH | Live "Allergens" tab — body-text parser ("Contains X / Does not contain X") |
| Raising Cane's | 6 | CNV | Known items; allergen PDF blocked (403) |
| Panda Express | 24 | CNV | Known items; all URLs 403/404 |
| Wingstop | 48 | CNV | Known items; PDF downloaded to `screenshots/Wingstop/allergen-source.pdf` — X-matrix format, column positions lost in text extraction |
| Five Guys | 25 | CNV | Known items; PDF downloaded to `screenshots/FiveGuys/allergen-source.pdf` |
| In-N-Out | 20 | CNV | Known items; PDF URL dead |

### Batch 2 — FIXED ✓

All 4 zero-row chains now return rows. Root causes identified and fixed:

| Chain | Rows | Status | Fix applied |
|-------|------|--------|-------------|
| Taco Bell | 31 | CNV | Allergen data via Nutritionix iframe — navigate to iframe URL directly; known items fallback |
| Jersey Mike's | 20 | CNV | Known items fallback — nutrition page structure changed |
| Subway | 35 | CNV | Site heavily bot-protected — network interception + known items fallback |
| Jimmy John's | 31 | CNV | React SPA with PerimeterX — PDF download via ctfassets.net + known items fallback |
| Firehouse Subs | 16 | CNV | Known items fallback |
| Potbelly | 33 | CNV | `/allergens` URL is 404 — switched to `/food/nutrition`; known items fallback |
| Einstein Bros | 25 | CNV | Known items fallback; allergen page not accessible |

### Batch 3 — NEW CHAIN SCRAPERS ✓

| Chain | Rows | Status | Notes |
|-------|------|--------|-------|
| Red Robin | 29 | CNV | Known items fallback — allergen page parse attempted |
| Little Caesars | 21 | CNV | Known items fallback — nutrition page parser |
| Sweetgreen | 17 | CNV | Known items fallback — menu card parser |
| Qdoba | 26 | CNV | Known items fallback — nutrition page parser |
| Del Taco | 22 | CNV | Known items fallback — allergen matrix parser |

### PDF Module

`src/scrapers/PDFScraper.js` — four parse strategies in priority order:
1. `_parseContainsFormat` — "Contains: Milk, Wheat" inline text (works for FiveGuys ingredient section)
2. `_parseDelimitedTable` — tab/space separated YES/NO table
3. `_parseXMatrix` — Wingstop-style X markers after item name
4. `_parseDotMatrix` — FiveGuys-style `••` dot matrix (extracts item names; allergen column positions lost)

Download: HTTPS fetch first → Playwright browser fallback on 403/404.

---

## Priority Next Steps

### Step 1 — Debug Batch 2 zeros (TacoBell, Subway, JimmyJohns, Potbelly)

For each zero chain, run the diagnostic pattern:
```bash
node src/index.js --chain tacobell --dry-run
```
Check the screenshot in `screenshots/TacoBell/` and the log in `logs/`. Then inspect the actual DOM and update the selector strategy in the scraper file.

**TacoBell** — `src/scrapers/TacoBell.js`  
URL: `https://www.tacobell.com/nutrition/allergen-info`  
Expected: allergen matrix table, rows = items, columns = allergens, checkmarks = presence

**Subway** — `src/scrapers/Subway.js`  
URL: `https://www.subway.com/en-US/MenuNutrition/Nutrition/AllergenMenu`  
Expected: accordion sections with per-item allergen table; try network interception for JSON API response instead of HTML parsing

**Jimmy John's** — `src/scrapers/JimmyJohns.js`  
URL: `https://www.jimmyjohns.com/our-food/allergen-information`  
Expected: static allergen chart with checkmarks

**Potbelly** — `src/scrapers/Potbelly.js`  
URL: `https://www.potbelly.com/allergens`  
429 rate-limit on first load — add a longer initial wait (5–10s) and retry

### Step 2 — Fix CNV chains with live allergen pages

**Jersey Mike's**: The nutrition page at `https://www.jerseymikes.com/menu/nutrition` does have allergen data — the scraper needs a deeper look at the SPA structure (likely React with lazy-loaded allergen tables).

**Einstein Bros**: `https://www.einsteinbros.com/allergens/` — check if the page redirects or has a different allergen matrix URL.

### Step 3 — PDF chains (get actual TRUE/FALSE data)

**Wingstop PDF** (`screenshots/Wingstop/allergen-source.pdf`):  
The X-matrix parser extracts rows with confidence=LOW. The PDF column order is:  
`Wheat | Dairy | Egg | Soy | Fish/Shellfish | Mustard | Celery`  
Known: all fried foods in soy oil (refined — not allergenic per FDA); Peanuts/TreeNuts = FALSE.  
Option: manually review the saved PDF and hardcode the allergen map in `src/scrapers/Wingstop.js`.

**In-N-Out**: Find the current allergen PDF URL — the old URL (`/docs/default-source/downloads/in-nout_allergen_info.pdf`) redirects to an error page. Check `https://www.in-n-out.com/nutrition` for the current link.

**Raising Cane's**: `https://www.raisingcanes.com/allergens` — the PDF is 403 blocked. Try navigating to the allergens page with Playwright and clicking through to the PDF.

**Panda Express**: All known PDF URLs return 403/404. Their allergen page (`/usca/en/allergens`) is also bot-blocked. Their published PDF guide can be found by searching their CDN or via Google cache.

### Step 4 — Remaining 30+ chain stubs

All chains in `src/scrapers/` that aren't in Batch 1 or 2 are stubs (return 0 rows). They follow the same pattern — implement `discoverMenuItems()` and `extractAllergens()`.

Chains with known working allergen pages (good next targets):
- `RedRobin.js` — `https://www.redrobin.com/allergen-information` — has a filter table
- `LittleCaesars.js` — `https://littlecaesars.com/en-us/nutrition` — per-item allergen panel
- `Sweetgreen.js` — `https://www.sweetgreen.com/menu` — per-item detail panel
- `Qdoba.js` — `https://www.qdoba.com/nutrition` — ingredient-level allergen data
- `DelTaco.js` — `https://www.deltaco.com/menus/nutrition` — allergen matrix table

---

## Architecture

```
src/
  index.js              — CLI orchestrator (--chain, --chains, --all, --resume, --dry-run)
  checkpoint.js         — save/load per-chain JSON checkpoints
  scrapers/
    BaseScraper.js      — Playwright base class (init, navigateTo, takeScreenshot, validateRow, buildCNVRow, parseAllergenText)
    PDFScraper.js       — standalone PDF download + text extraction + 4 parse strategies
    McDonalds.js        — ✓ live
    Chipotle.js         — ✓ live
    ChickFilA.js        — ✓ live
    [all others]        — see state table above
  output/
    schema.js           — COLUMNS, ALLERGENS array, makeEmptyRow(), CELL_STYLES
    ExcelWriter.js      — addChainSheet(), addSummarySheet(), save()
  utils/
    logger.js           — winston (console + logs/run-*.log)
    screenshot.js       — saveScreenshot() helper
```

### Row schema (9 allergens + metadata)

```js
{
  rowNum, menuCategory, itemName,
  milk, eggs, fish, shellfish, treeNuts, peanuts, wheat, soy, sesame,  // TRUE | FALSE | COULD_NOT_VERIFY
  crossContact,   // YES | NO | COULD_NOT_VERIFY
  confidence,     // HIGH | LOW | COULD_NOT_VERIFY
  sourceText,     // raw text the value was derived from
  sourceUrl,      // page URL scraped
  scrapeDate,     // ISO timestamp
}
```

### Key BaseScraper methods

| Method | Purpose |
|--------|---------|
| `init()` | Launch Chromium headless with anti-bot args |
| `navigateTo(url)` | goto with 30s timeout; returns false on timeout/error |
| `takeScreenshot(label)` | Save to `screenshots/{chainName}/{label}-{ts}.png` |
| `buildCNVRow(cat, name, url, reason)` | All-CNV row with reason in sourceText |
| `parseAllergenText(text)` | Parse "Contains: Milk, Wheat" into allergen fields |
| `validateRow(row)` | Assert all allergen fields are exactly TRUE/FALSE/COULD_NOT_VERIFY |

---

## Known Issues / Gotchas

1. **`page.locator()` vs `page.$()`**: `page.$()` takes CSS only. For text-based selection use `page.locator('button:has-text("...")')`.

2. **Chipotle allergen columns**: Only 3 tracked (Dairy, Soy, Gluten). The other 6 allergens are statically FALSE per their published disclaimer — do NOT add them as CNV.

3. **Chick-fil-A format**: The allergen view embeds per-allergen data in accordion body text as "Contains X" / "Does not contain X" per-line format — NOT a table with columns. The `_parseAllergenBodyText()` method handles this.

4. **PDF matrix PDFs (Wingstop, FiveGuys)**: pdf-parse text extraction loses column position info. The X/dot count per row is available but specific column-to-allergen mapping requires reviewing the saved PDF file directly.

5. **Subway timeouts**: The site is aggressive about bot detection. Try network interception (listen for XHR responses with allergen JSON) rather than HTML parsing.

6. **Rate limiting**: Use `Bottleneck` (already used in PandaExpress) for chains that 429. Pattern: `{ minTime: 3000, maxConcurrent: 1 }`.

7. **SPA rendering**: Some chains need `waitForLoadState('networkidle')` + additional `waitForTimeout(3000)` for JS-rendered content. Always take a screenshot immediately after navigation to diagnose what was actually loaded.
