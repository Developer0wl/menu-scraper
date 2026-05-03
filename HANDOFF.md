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

## Progress Log

### 2026-05-03 — Batch 2 Fixes + Batch 3 New Chains

**Root causes identified and fixed for all 4 zero-row Batch 2 chains:**

| Chain | Root Cause | Fix Applied |
|-------|-----------|-------------|
| TacoBell | Allergen page uses a Nutritionix `<iframe>` — no `<table>` exists in parent frame | Navigate to Nutritionix URL directly; 31 known items fallback |
| JimmyJohns | React SPA (`<div id="root">`) with PerimeterX bot protection; data is PDF-only on ctfassets.net | PDF download via ctfassets.net CDN + PDFScraper integration; 31 known items fallback |
| Subway | Aggressive bot protection (PerimeterX/Cloudflare); 429s and timeouts | Network interception for JSON API responses; 35 known items fallback |
| Potbelly | `/allergens` URL returns 404 ("OOPs! This isn't what you're looking for") | Switched primary URL to `/food/nutrition`; added 404 detection; 33 known items fallback |

**5 new chain scrapers implemented (previously stubs):**
- Red Robin (29 items), Little Caesars (21), Sweetgreen (17), Qdoba (26), Del Taco (22)

**Validation:** All 9 scrapers syntax-checked + dry-run tested. Pushed to GitHub.

---

## Priority Next Steps

### Step 1 ✅ DONE — Debug Batch 2 zeros (TacoBell, Subway, JimmyJohns, Potbelly)

All 4 zero-row chains now return rows. See Batch 2 table above.

### Step 2 ✅ DONE — Implement priority new chains (RedRobin, LittleCaesars, Sweetgreen, Qdoba, DelTaco)

All 5 chains implemented with full scraper logic + known items fallback. See Batch 3 table above.

### Step 3 — Upgrade CNV chains to HIGH quality

Many chains currently return CNV (known items fallback) because live site parsing failed. These should be upgraded to extract actual TRUE/FALSE allergen data:

**Jersey Mike's** — `src/scrapers/JerseyMikes.js`  
The nutrition page at `https://www.jerseymikes.com/menu/nutrition` has allergen data — needs deeper SPA parsing (React with lazy-loaded allergen tables).

**Einstein Bros** — `src/scrapers/EinsteinBrosBagels.js`  
`https://www.einsteinbros.com/allergens/` — check if page redirects or has a different URL.

**TacoBell** — `src/scrapers/TacoBell.js`  
The Nutritionix iframe at `https://www.nutritionix.com/taco-bell/menu/special-diets/premium` has actual allergen filter data. Navigate to this URL in a browser and parse the allergen checkboxes/labels to get TRUE/FALSE per item.

**Subway** — `src/scrapers/Subway.js`  
Site has aggressive bot protection. Consider using a non-headless browser or proxy rotation to bypass PerimeterX.

### Step 4 — PDF chains (get actual TRUE/FALSE data)

**Wingstop PDF** (`screenshots/Wingstop/allergen-source.pdf`):  
The X-matrix parser extracts rows with confidence=LOW. The PDF column order is:  
`Wheat | Dairy | Egg | Soy | Fish/Shellfish | Mustard | Celery`  
Known: all fried foods in soy oil (refined — not allergenic per FDA); Peanuts/TreeNuts = FALSE.  
Option: manually review the saved PDF and hardcode the allergen map in `src/scrapers/Wingstop.js`.

**In-N-Out**: Find the current allergen PDF URL — the old URL is dead. Check `https://www.in-n-out.com/nutrition`.

**Raising Cane's**: PDF is 403 blocked. Try navigating with Playwright and clicking through to the PDF.

**Panda Express**: All known PDF URLs return 403/404. Try Google cache or CDN search.

### Step 5 — Remaining 25+ chain stubs

All chains in `src/scrapers/` not in Batches 1–3 are still stubs (return 0 rows). Follow the same pattern — implement `discoverMenuItems()` and `extractAllergens()`.

Good next targets (chains with known public allergen pages):
- `CAVA.js` — `https://cava.com/allergens`
- `Zaxbys.js` — `https://www.zaxbys.com/nutrition`
- `BlazePizza.js` — `https://www.blazepizza.com/nutrition`
- `MODPizza.js` — `https://modpizza.com/nutrition`
- `NoodlesAndCompany.js` — `https://www.noodles.com/nutrition`
- `Whataburger.js` — `https://www.whataburger.com/nutrition`
- `TimHortons.js` — `https://www.timhortons.com/nutrition`

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

5. ✅ **Subway timeouts** (RESOLVED): Network interception added to capture JSON API responses during page load. Falls back to known items when bot protection blocks all content.

6. **Rate limiting**: Use `Bottleneck` (already used in PandaExpress) for chains that 429. Pattern: `{ minTime: 3000, maxConcurrent: 1 }`.

7. **SPA rendering**: Some chains need `waitForLoadState('networkidle')` + additional `waitForTimeout(3000)` for JS-rendered content. Always take a screenshot immediately after navigation to diagnose what was actually loaded.

8. **TacoBell uses Nutritionix iframe**: The allergen page at `tacobell.com/nutrition/allergen-info` embeds a Nutritionix widget via `<iframe>`. The parent page has NO allergen data in its DOM. Navigate to `https://www.nutritionix.com/taco-bell/menu/special-diets/premium` directly.

9. **JimmyJohns is a React SPA with PerimeterX**: The allergen page (`/our-food/allergen-information`) renders as `<div id="root">` with no server-rendered content. Allergen data is only in a downloadable PDF from ctfassets.net CDN. The PDF link is in the page footer.

10. **Potbelly /allergens is dead**: The URL `potbelly.com/allergens` returns a 404 page. Use `potbelly.com/food/nutrition` instead. The scraper detects 404 pages by checking for "oops" or "not found" in body text.

11. **Playwright browser install**: On Windows with restricted execution policies, use `node node_modules\.bin\playwright.cmd install chromium` instead of `npx playwright install`.
