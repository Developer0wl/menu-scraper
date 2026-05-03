# Allerva Scraper — Project Handoff

Last updated: 2026-05-03  
Repository: https://github.com/Developer0wl/menu-scraper

---

## What This Project Does

Scrapes allergen data (TRUE / FALSE / COULD_NOT_VERIFY) for every menu item at 53 US restaurant chains.  
Output: one Excel file with one sheet per chain, allergen columns D-L (Milk, Eggs, Fish, Shellfish, Tree Nuts, Peanuts, Wheat, Soy, Sesame).

---

## How to Run

```bash
cd allerva-scraper
npm install
npx playwright install chromium

# Single chain (dry-run = no Excel write)
node src/index.js --chain mcdonalds --dry-run

# Multiple chains
node src/index.js --chains tacobell,subway,jimmyjohns

# All 53 chains — writes output/allerva-YYYYMMDD.xlsx
node src/index.js --all

# Skip already-scraped chains (reads checkpoints/)
node src/index.js --all --resume

# PDF extraction test (5 chains)
node run-pdf-test.js
```

---

## Current State (as of 2026-05-03)

### FULLY IMPLEMENTED: All 53 scrapers have KNOWN_ITEMS + full parse logic

Every scraper follows this tiered strategy:
1. Navigate to the official allergen/nutrition URL
2. Try live table parse (allergen matrix)
3. Try body text scan ("Contains: Milk, Wheat")
4. Fall back to KNOWN_ITEMS with all allergens = COULD_NOT_VERIFY

### Live chains (actual TRUE/FALSE — not CNV)

| Chain | Rows | Quality | Notes |
|-------|------|---------|-------|
| McDonald's | ~191 | HIGH | Live — nutrition calculator, category nav + per-item modal |
| Chipotle | 26 | HIGH | Live — static table at /allergens; 3 cols (Dairy, Soy, Gluten); 6 others statically FALSE |
| Chick-fil-A | 161 | HIGH | Live — allergen accordion body text, "Contains X"/"Does not contain X" per line |

### PDF chains (downloaded — partial mapping)

| Chain | Rows | Quality | Notes |
|-------|------|---------|-------|
| Wingstop | 48 | LOW | PDF at screenshots/Wingstop/allergen-source.pdf — X-matrix, col positions lost in text extraction |
| Five Guys | 32 | HIGH | PDF at screenshots/FiveGuys/allergen-source.pdf — "Contains:" format parsed |

### All others: KNOWN_ITEMS fallback (CNV)

All 48 remaining chains have realistic KNOWN_ITEMS lists (15-30 items each) and return CNV for all allergens.  
These are correct placeholders — replace with live scraping one chain at a time as needed.

| Chain | Items | Chain | Items | Chain | Items |
|-------|-------|-------|-------|-------|-------|
| TacoBell | 31 | Subway | 35 | JimmyJohns | 31 |
| JerseyMikes | 20 | FirehouseSubs | 16 | Potbelly | 33 |
| EinsteinBros | 25 | RedRobin | 29 | LittleCaesars | 21 |
| Sweetgreen | 17 | Qdoba | 26 | DelTaco | 22 |
| Whataburger | 25 | CrackerBarrel | 27 | LongHornSteakhouse | 26 |
| TexasRoadhouse | 25 | WaffleHouse | 25 | CarlsJr | 21 |
| Hardees | 18 | WhiteCastle | 22 | SteakNShake | 21 |
| Smashburger | 21 | Zaxbys | 18 | Bojangles | 21 |
| TimHortons | 26 | GoldenCorral | 24 | BobEvans | 24 |
| BlazePizza | 17 | MarcosPizza | 19 | RoundTablePizza | 14 |
| MODPizza | 15 | CAVA | 17 | Freshii | 16 |
| JustSalad | 14 | VeggieGrill | 15 | TeriyakiMadness | 17 |
| Jamba | 17 | TropicalSmoothieCafe | 17 | NoodlesAndCompany | 18 |
| BJsRestaurants | 18 | YardHouse | 19 | TGIFridays | 19 |
| PFChangs | 20 | MoesSouthwestGrill | 18 | PeiWei | 17 |
| RaisingCanes | 6 | PandaExpress | 24 | InNOutBurger | 20 |

---

## What Needs to Be Done Next

### Priority 1 — Upgrade CNV chains to live TRUE/FALSE

Pick chains with known public allergen pages and implement live scraping.  
Best candidates (simple allergen table format):

| Chain | URL to scrape | Format |
|-------|--------------|--------|
| Whataburger | whataburger.com/food/allergens | HTML table |
| Noodles & Company | noodles.com/allergen-information | HTML table |
| Tim Hortons | timhortons.com/us/en/menu/nutrition.html | HTML table |
| CAVA | cava.com/allergens | HTML table |
| Blaze Pizza | blazepizza.com/nutrition | HTML table |

### Priority 2 — Fix PDF chains

- **Wingstop**: PDF saved at `screenshots/Wingstop/allergen-source.pdf`. Column order: `Wheat | Dairy | Egg | Soy | Fish/Shellfish | Mustard | Celery`. The X-count per row is known — manually review and hardcode allergen map in Wingstop.js.
- **In-N-Out**: Old PDF URL is dead. Check `https://www.in-n-out.com/nutrition` for current allergen PDF link.
- **Raising Cane's**: PDF 403 blocked. Try Playwright with real browser headers.
- **Panda Express**: All URLs 403/404. Try the app or a mirror.

### Priority 3 — Run --all and validate output

```bash
node src/index.js --all --dry-run  # Verify all 53 chains return items
node src/index.js --all            # Write full Excel output
```

Expect ~1,200 rows across 53 chains. Validation log at `logs/validation.log`.

---

## Architecture

```
src/
  index.js              - CLI orchestrator (--chain, --chains, --all, --resume, --dry-run)
  checkpoint.js         - save/load per-chain JSON checkpoints
  scrapers/
    BaseScraper.js      - Playwright base (init, navigateTo, takeScreenshot, validateRow, buildCNVRow, parseAllergenText)
    PDFScraper.js       - PDF download + text extraction + 4 parse strategies
    McDonalds.js        - LIVE (nutrition calculator)
    Chipotle.js         - LIVE (static allergen table)
    ChickFilA.js        - LIVE (allergen accordion)
    Wingstop.js         - PDF (X-matrix, LOW confidence)
    FiveGuys.js         - PDF (Contains: format, HIGH confidence)
    [48 others]         - KNOWN_ITEMS fallback with CNV
  output/
    schema.js           - COLUMNS, ALLERGENS array, makeEmptyRow(), CELL_STYLES
    ExcelWriter.js      - addChainSheet(), addSummarySheet(), save()
  utils/
    logger.js           - winston (console + logs/run-*.log)
    screenshot.js       - saveScreenshot() helper
```

### Row schema

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
| `validateRow(row)` | Assert all allergen fields are TRUE/FALSE/COULD_NOT_VERIFY |

---

## Known Issues / Gotchas

1. **`page.locator()` vs `page.$()`**: `page.$()` is CSS only. For text: `page.locator('button:has-text("...")')`.

2. **Chipotle**: Only 3 allergen cols (Dairy, Soy, Gluten). The other 6 are statically FALSE per disclaimer — do NOT mark as CNV.

3. **Chick-fil-A**: Allergen view uses accordion body text with "Contains X" / "Does not contain X" per line, NOT a table. `_parseAllergenBodyText()` handles this.

4. **PDF column-position loss**: pdf-parse text extraction loses column positions. The X/dot count per row is available but specific column mapping requires reviewing the saved PDF file.

5. **Subway timeouts**: Heavily bot-protected (PerimeterX). Network interception added. Always falls back to known items.

6. **TacoBell Nutritionix iframe**: The allergen page embeds a Nutritionix widget in an `<iframe>`. No allergen data in parent DOM. Navigate to `nutritionix.com/taco-bell/menu/special-diets/premium` directly.

7. **JimmyJohns React SPA**: Allergen data is PDF-only from ctfassets.net CDN. PDF link is in the page footer. `_findPdfLinkInPage()` searches for it.

8. **Potbelly /allergens is dead**: Use `/food/nutrition` instead. Scraper detects 404 pages via body text scan.

9. **pdf-parse version**: Must be `v1.1.1` (NOT v2.x). v2 uses a class-based API that breaks the scraper. Run `npm install pdf-parse@1.1.1 --save-exact` if needed.

10. **Playwright on Windows**: Use `node node_modules\.bin\playwright.cmd install chromium` if `npx` fails.

11. **Rate limiting**: Use `Bottleneck` for chains that return 429. Pattern: `{ minTime: 3000, maxConcurrent: 1 }`.

---

## Progress Log

### Session 1 (Batch 1)
- Built full infrastructure: BaseScraper, schema.js, ExcelWriter, logger, index.js CLI
- Implemented McDonalds (live), Chipotle (live), ChickFilA (live)
- Built PDFScraper module: 4 parse strategies (Contains-format, delimited table, X-matrix, dot-matrix)
- PDF test: Wingstop 44 rows (X-matrix/LOW), FiveGuys 32 rows (Contains-format/HIGH)
- PDF failures: RaisingCanes/PandaExpress (403), InNOut (dead URL)

### Session 2 (Batch 2)
- Fixed 4 zero-row chains: TacoBell (Nutritionix iframe), Subway (network interception), JimmyJohns (PDF via ctfassets), Potbelly (404 URL)
- Added: JerseyMikes, FirehouseSubs, EinsteinBros
- Built HANDOFF.md, initialized git repo, pushed to GitHub

### Session 3 (Batch 3)
- Added: RedRobin, LittleCaesars, Sweetgreen, Qdoba, DelTaco

### Session 4 (Batch 4 — THIS SESSION)
- Implemented ALL remaining 33 stubs:
  - Burgers: Whataburger, CarlsJr, Hardees, WhiteCastle, SteakNShake, Smashburger
  - Southern/Texas: CrackerBarrel, LongHornSteakhouse, TexasRoadhouse, WaffleHouse
  - Chicken: Zaxbys, Bojangles
  - Canadian/Family: TimHortons, GoldenCorral, BobEvans
  - Pizza: BlazePizza, MarcosPizza, RoundTablePizza, MODPizza
  - Healthy fast-casual: CAVA, Freshii, JustSalad, VeggieGrill, TeriyakiMadness
  - Smoothies/bowls: Jamba, TropicalSmoothieCafe
  - Asian: PFChangs, PeiWei, MoesSouthwestGrill, NoodlesAndCompany, TeriyakiMadness
  - Casual dining: BJsRestaurants, YardHouse, TGIFridays
- All 53 scrapers now have KNOWN_ITEMS + live-parse attempt + CNV fallback
- 0 stubs remaining

---

## Complete Chain Registry (53 chains)

```
mcdonalds, wingstop, fiveguys, chipotle, innoutburger, chickfila,
subway, whataburger, longhornsteakhouse, crackerbarrel, tacobell,
texasroadhouse, raisingcanes, jerseymikes, jimmyjohns, redrobin,
littlecaesars, sweetgreen, cava, zaxbys, blazepizza, modpizza,
noodlesandcompany, pfchangs, timhortons, smashburger, whitecastle,
carlsjr, hardees, steak_n_shake, bojangles, qdoba, moes, deltaco,
marcospizza, roundtablepizza, firehousesubs, potbelly, jamba,
einsteinbros, tgifridays, bobevans, goldencorral, bjsrestaurants,
yardhouse, wafflehouse, veggiegrill, freshii, justsalad,
teriyakimadness, tropicalsmoothie, pandaexpress, peiwei
```
