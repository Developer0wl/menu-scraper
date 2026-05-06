# Allerva Scraper — Project Handoff

Last updated: 2026-05-05  
Repository: https://github.com/Developer0wl/menu-scraper  
Handed off to: antigravity

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
node src/index.js --chains tacobell,subway,jimmyjohns --dry-run

# All 53 chains — writes output/allerva-YYYYMMDD.xlsx
node src/index.js --all

# Skip already-scraped chains (reads checkpoints/)
node src/index.js --all --resume

# PDF extraction test
node run-pdf-test.js
```

---

## Current State — as of 2026-05-03

### Overall: 0 stubs. All 53 scrapers are fully implemented.

Every scraper follows this tiered strategy:
1. Navigate to official allergen/nutrition URL
2. Try live table parse (allergen matrix with checkmarks)
3. Try body text scan ("Contains: Milk, Wheat" pattern)
4. Fall back to KNOWN_ITEMS with all allergens = COULD_NOT_VERIFY

---

## Scraper Quality Tiers

### TIER 1 — Live TRUE/FALSE (fully working)

| Chain | Rows | Strategy | Notes |
|-------|------|----------|-------|
| McDonald's | ~191 | Live HTML | Nutrition calculator — category nav + per-item modal |
| Chipotle | 26 | Live table | Static /allergens table — 3 cols (Dairy, Soy, Gluten); 6 others statically FALSE |
| Chick-fil-A | 161 | Live body text | Allergen accordion "Contains X / Does not contain X" per-line format |
| Blaze Pizza | 248 | Live API | Intercepts Nutritionix JSON payload directly (HybridScraper) |
| Tim Hortons | 311 | Live API | Intercepts Sanity.io GraphQL API directly (HybridScraper) |

### TIER 2 — PDF extraction (downloaded, partial)

| Chain | Rows | Confidence | Notes |
|-------|------|-----------|-------|
| Five Guys | 32 | HIGH | PDF at screenshots/FiveGuys/allergen-source.pdf — "Contains:" format parsed |
| Wingstop | 48 | LOW | PDF at screenshots/Wingstop/allergen-source.pdf — X-matrix; column positions lost |

### TIER 3 — KNOWN_ITEMS fallback (CNV)

All 48 remaining chains. Pages load but content is JS-rendered or behind bot protection.
Live-testing showed:
- **NoodlesAndCompany**: URL redirects to homepage — allergen page URL changed
- **WaffleHouse**: Page loads but content is blank (JS renders after networkidle)
- **TimHortons**: Blocked/timeout
- **CAVA**: Allergen PDF link visible on page — upgraded to PDFScraper strategy (will attempt PDF download on next run)

| Chain | Items | Chain | Items | Chain | Items |
|-------|-------|-------|-------|-------|-------|
| TacoBell | 31 | Subway | 35 | JimmyJohns | 32 |
| JerseyMikes | 20 | FirehouseSubs | 16 | Potbelly | 33 |
| EinsteinBros | 25 | RedRobin | 29 | LittleCaesars | 21 |
| Sweetgreen | 17 | Qdoba | 26 | DelTaco | 22 |
| Whataburger | 25 | CrackerBarrel | 27 | LongHornSteakhouse | 26 |
| TexasRoadhouse | 25 | WaffleHouse | 25 | CarlsJr | 21 |
| Hardees | 18 | WhiteCastle | 22 | SteakNShake | 21 |
| Smashburger | 21 | Zaxbys | 18 | Bojangles | 21 |
| MODPizza | 15 | CAVA | 17 | Freshii | 16 |
| JustSalad | 14 | VeggieGrill | 15 | TeriyakiMadness | 17 |
| Jamba | 17 | TropicalSmoothieCafe | 17 | NoodlesAndCompany | 18 |
| BJsRestaurants | 18 | YardHouse | 19 | TGIFridays | 19 |
| PFChangs | 20 | MoesSouthwestGrill | 18 | PeiWei | 17 |
| RaisingCanes | 6 | PandaExpress | 24 | InNOutBurger | 20 |
| Wingstop | 9* | FiveGuys | 25 | | |

*Wingstop KNOWN_ITEMS = 9; actual scraped rows = 48 from PDF

---

## URL Audit (Updated 2026-05-06)

Verified current allergen/nutrition URLs for all problem chains:

| Chain | Old URL (broken) | New/Correct URL | Status |
|-------|-----------------|-----------------|--------|
| Jersey Mike's | `/allergens` (404) | `jerseymikes.com/menu/food-allergy` | ✅ Fixed in scraper |
| In-N-Out Burger | `/docs/nutritional_info.pdf` (dead) | `/docs/default-source/downloads/in-n-out_allergen_info.pdf` | ✅ Fixed in scraper |
| Panda Express | `/usca/en/allergens` (bot-blocked) | `pandaexpress.com/nutritioninformation` | ✅ Fixed in scraper |
| Potbelly | `/food/nutrition` (redirects) | `potbelly.com/nutrition-calculator` | ✅ Fixed in scraper |
| WaffleHouse | `/nutrition` (JS blank) | `/nutrition` + sub-pages + allergen PDF | ✅ Fixed in scraper |
| NoodlesAndCompany | `/allergen-information` (redirects) | `noodles.com/eatwell` (alt: `/eat-well`) | ✅ Fixed in scraper |
| Raising Cane's | PDF (403 blocked) | `raisingcanes.com/allergens/` HTML page | ⚠️ Try HTML with longer wait |
| Wingstop | PDF (local copy) | Possible new PDF: S3 URL (see P4) | ⚠️ Needs column map fix |

---

## What Needs to Be Done (Priority Order)

### P1 — Set up Python AI sidecar and run pilot chains (NEW — Session 5)

ScrapeGraphAI integration is now built. Before using it, one-time setup is required:

```bash
cd allerva-scraper

# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Install Python Playwright browser (separate from the Node.js one)
playwright install chromium

# 3. Set your LLM provider API key (Groq is free tier, recommended)
#    Windows PowerShell:
$env:GROQ_API_KEY = "your_key_here"
#    Or add to your shell profile permanently

# 4. Test a single pilot chain (dry-run, no Excel written)
node src/index.js --chain blazepizza --use-ai --dry-run

# 5. Run all 5 pilot chains
node src/index.js --chains blazepizza,modpizza,jerseymikes,marcospizza,timhortons --use-ai --dry-run
```

**AI pilot chains (5):**
| Chain key    | Chain name   | Target URL |
|-------------|-------------|-----------|
| `blazepizza`  | Blaze Pizza  | blazepizza.com/nutrition |
| `modpizza`    | MOD Pizza    | modpizza.com/nutrition |
| `jerseymikes` | Jersey Mike's | jerseymikes.com/allergens |
| `marcospizza` | Marco's Pizza | marcos.com/nutrition |
| `timhortons`  | Tim Hortons  | timhortons.com/us/en/menu/nutrition.html |

**Environment variables for AIScraper:**
| Variable | Purpose | Default |
|----------|---------|---------|
| `GROQ_API_KEY` | Groq API key (recommended) | — |
| `OPENAI_API_KEY` | OpenAI API key | — |
| `AI_PROVIDER` | `groq` / `openai` / `ollama` | `groq` |
| `AI_MODEL` | Model name | `llama-3.1-70b-versatile` |
| `OLLAMA_BASE_URL` | Ollama server URL | `http://localhost:11434` |

If AI extraction returns 0 rows (bot-protected page, bad model output, etc.) the chain logs `EMPTY` status and no rows are written — use `--resume` on subsequent runs so other chains aren't re-scraped.

### P2 — Run full --all dry-run to baseline all 53 chains

```bash
node src/index.js --all --dry-run 2>&1 | tee logs/baseline-run.txt
```

Expected: ~1,100-1,300 total rows, 0 errors. Check logs/validation.log for any row issues.

### P2 ✅ DONE — Fix URL issues found during live testing

| Chain | Issue | Fix |
|-------|-------|-----|
| NoodlesAndCompany | URL redirects to homepage | ✅ Fixed: URL updated to `/eatwell` (alt: `/eat-well`), 18 rows parsed with TRUE/FALSE. |
| WaffleHouse | JS-rendered, blank after load | ✅ Fixed: Added `waitForSelector`, now also tries sub-pages `/breakfast-nutritionals/` and `/lunch-and-dinner-nutritionals/`. Has allergen PDF at `wafflehouse.com/wp-content/uploads/FoodAllergensPoster.2.2023.pdf`. |
| JerseyMikes | `/allergens` was 404 | ✅ Fixed: Now uses `https://www.jerseymikes.com/menu/food-allergy` as primary URL, `/menu/nutrition` as fallback. |
| InNOutBurger | Old PDF URL dead | ✅ Fixed: New PDF URL `https://www.in-n-out.com/docs/default-source/downloads/in-n-out_allergen_info.pdf`. HTML page at `/menu/nutrition-info`. |
| PandaExpress | `/usca/en/allergens` bot-blocked | ✅ Fixed: Now uses `https://www.pandaexpress.com/nutritioninformation` as primary URL. |
| Potbelly | `/food/nutrition` redirects | ✅ Fixed: Now uses `https://www.potbelly.com/nutrition-calculator` as primary URL. |

*Note: CAVA was tested but `PDFScraper` returns all-FALSE due to `pdf-parse` matrix dropping. Moved to P4.*

### P3 — Upgrade CNV chains to TRUE/FALSE (API-First Strategy)

**Architecture Pivot:** Due to the complexity of SPAs (like Blaze Pizza's interactive wizard), manual DOM parsing (clicking through UI elements) is too brittle. We are pivoting to an **API-First Strategy**. For these chains, we will intercept the raw JSON network requests (often from third-party providers like Nutritionix) to extract structured allergen arrays directly.

Best candidates for API-based extraction:

| Chain | Target URL | Approach |
|-------|-----------|----------|
| Tim Hortons | timhortons.com/us/en/menu/nutrition.html | Look for internal JSON API powering the menu |
| Blaze Pizza | blazepizza.com/nutrition | Inspect interactive wizard for hidden JSON endpoint |
| MOD Pizza | modpizza.com/nutrition | Inspect interactive wizard for hidden JSON endpoint |
| Jersey Mike's | jerseymikes.com/allergens | Investigate API or SPA state for allergen data |
| Marco's Pizza | marcos.com/nutrition | Investigate API for table data |

To upgrade a chain: Identify the API endpoint, add network interception logic (or direct `fetch()`), and test with `--chain X --dry-run` to confirm rows show TRUE/FALSE.

### P4 — Fix PDF chains

The generic `PDFScraper` loses column position info for checkmark/X-matrix PDFs. The following chains successfully download PDFs but require manual hardcoding in their specific scraper files:

**Wingstop** (`screenshots/Wingstop/allergen-source.pdf`):
Column order: `Wheat | Dairy | Egg | Soy | Fish/Shellfish | Mustard | Celery`
Peanuts/TreeNuts = FALSE (not used as ingredients).
A potential newer PDF URL: `https://s3.amazonaws.com/wingstop.com/assets/static/WS_Allergens_8.21.25.pdf`

**CAVA** (`screenshots/CAVA/allergen-source.pdf`):
Matrix parsing drops column positions. Needs manual map.

**Whataburger** (`screenshots/Whataburger/allergen-source.pdf`):
URL returns PDF directly. Matrix parsing drops column positions. Needs manual map.

**In-N-Out**: ✅ PDF URL updated in scraper.
New PDF: `https://www.in-n-out.com/docs/default-source/downloads/in-n-out_allergen_info.pdf`
HTML page: `https://www.in-n-out.com/menu/nutrition-info`

**Raising Cane's**: HTML allergen page at `https://www.raisingcanes.com/allergens/` is the recommended approach (not PDF). The page is a Gatsby SPA — try network interception or waitForSelector with longer timeout.

**Panda Express**: ✅ URL updated in scraper. New URL: `https://www.pandaexpress.com/nutritioninformation` (replaces the bot-blocked `/usca/en/allergens`). Try this page with a longer wait — it may have a static table.

### P5 — Produce final Excel output

```bash
node src/index.js --all
# Output: output/allerva-YYYYMMDD.xlsx
```

---

## Architecture

```
src/
  index.js              - CLI (--chain, --chains, --all, --resume, --dry-run, --use-ai)
  checkpoint.js         - save/load per-chain JSON checkpoints
  scrapers/
    BaseScraper.js      - Playwright base class
    PDFScraper.js       - PDF download + 4 parse strategies
    AIScraper.js        - ScrapeGraphAI bridge (NEW — Session 5)
    McDonalds.js        - LIVE (nutrition calculator, category nav)
    Chipotle.js         - LIVE (static allergen table)
    ChickFilA.js        - LIVE (allergen accordion body text)
    Wingstop.js         - PDF (X-matrix, LOW confidence — needs column fix)
    FiveGuys.js         - PDF (Contains: format, HIGH confidence)
    CAVA.js             - PDF strategy added (untested)
    [48 others]         - KNOWN_ITEMS fallback with CNV
  output/
    schema.js           - COLUMNS, ALLERGENS, makeEmptyRow(), CELL_STYLES
    ExcelWriter.js      - addChainSheet(), addSummarySheet(), save()
  utils/
    logger.js           - winston (console + logs/run-*.log)
    screenshot.js       - saveScreenshot() helper
scrape_ai.py            - Python sidecar for ScrapeGraphAI (NEW — Session 5)
requirements.txt        - Python deps: scrapegraphai, langchain-groq, langchain-openai
checkpoints/            - per-chain JSON (auto-saved after each chain)
screenshots/            - per-chain PNG screenshots (taken during scrape)
logs/                   - run-*.log + validation.log
output/                 - Excel files (gitignored)
```

### Row schema

```js
{
  rowNum, menuCategory, itemName,
  milk, eggs, fish, shellfish, treeNuts, peanuts, wheat, soy, sesame,
  // each: TRUE | FALSE | COULD_NOT_VERIFY
  crossContact,   // YES | NO | COULD_NOT_VERIFY
  confidence,     // HIGH | LOW | COULD_NOT_VERIFY
  sourceText,     // raw text the value was derived from (max 80 chars)
  sourceUrl,      // page URL scraped
  scrapeDate,     // ISO timestamp
}
```

### Key BaseScraper methods

| Method | Purpose |
|--------|---------|
| `init()` | Launch Chromium headless with anti-bot args |
| `navigateTo(url)` | goto with 30s timeout; returns false on timeout/error |
| `takeScreenshot(label)` | Save to screenshots/{chainName}/{label}-{ts}.png |
| `buildCNVRow(cat, name, url, reason)` | All-CNV row with reason in sourceText |
| `parseAllergenText(text)` | Parse "Contains: Milk, Wheat" text into allergen fields |
| `validateRow(row)` | Assert all 9 allergen fields are TRUE/FALSE/COULD_NOT_VERIFY |

---

## Known Issues & Gotchas

1. **pdf-parse must be v1.1.1** — NOT v2.x. v2 has a class-based API that breaks PDFScraper.
   Check: `node -e "const p=require('pdf-parse'); console.log(typeof p)"` should print `function`.
   Fix: `npm install pdf-parse@1.1.1 --save-exact`

2. **`page.locator()` vs `page.$()`** — `page.$()` is CSS only. For text matching use `page.locator('button:has-text("...")')`.

3. **Chipotle only has 3 allergen columns** — Dairy, Soy, Gluten (mapped to milk, soy, wheat). The other 6 are statically FALSE per their published disclaimer. Do NOT change them to CNV.

4. **Chick-fil-A allergen format** — Accordion body text with "Contains X" / "Does not contain X" per line, NOT a table. The `_parseAllergenBodyText()` method handles this.

5. **Wingstop PDF column-position loss** — pdf-parse text extraction loses the column grid. Only X count per row is recoverable. The saved PDF is at `screenshots/Wingstop/allergen-source.pdf` — open it to verify column order, then hardcode.

6. **TacoBell uses Nutritionix iframe** — Parent page has NO allergen data in DOM. Navigate to `nutritionix.com/taco-bell/menu/special-diets/premium` directly.

7. **JimmyJohns is a React SPA** — Allergen data is PDF-only from ctfassets.net CDN. PDF link is in page footer. `_findPdfLinkInPage()` searches for it.

8. **Potbelly /allergens is 404** — URL is `potbelly.com/food/nutrition` now.

9. **Subway PerimeterX** — Network interception captures JSON API responses if any fire. Otherwise falls back to known items.

10. **Playwright on Windows** — If `npx playwright install` fails, use:
    `node node_modules\.bin\playwright.cmd install chromium`

11. **Rate limiting** — For chains that 429, use `Bottleneck`: `{ minTime: 3000, maxConcurrent: 1 }` (pattern shown in PandaExpress.js).

12. **NoodlesAndCompany URL** — Current OFFICIAL_URL redirects to homepage. Find the correct allergen page URL and update the scraper.

---

## Session History

### Session 1 — Bootstrap + Batch 1
- Built full infra: BaseScraper, schema.js, ExcelWriter, logger, checkpoint, index.js CLI
- Implemented McDonalds (live), Chipotle (live), ChickFilA (live)
- Built PDFScraper module with 4 parse strategies
- PDF test: Wingstop 44 rows (X-matrix/LOW), FiveGuys 32 rows (Contains:/HIGH)
- PDF failures: RaisingCanes (403), PandaExpress (403/404), InNOut (dead URL)

### Session 2 — Batch 2 fixes
- Fixed 4 zero-row chains: TacoBell (iframe), Subway (interception), JimmyJohns (PDF), Potbelly (404 URL)
- Added: JerseyMikes, FirehouseSubs, EinsteinBros
- git init, HANDOFF.md, pushed to GitHub

### Session 3 — Batch 3
- Added: RedRobin, LittleCaesars, Sweetgreen, Qdoba, DelTaco

### Session 5 — ScrapeGraphAI integration + end-to-end validation (2026-05-05)

**Goal:** Upgrade Tier 3 KNOWN_ITEMS chains to real TRUE/FALSE allergen data using ScrapeGraphAI.

#### What was built
- `scrape_ai.py` — Python CLI sidecar:
  - Accepts `--chain-name`, `--url`, `--provider` (groq/openai/ollama), `--model`
  - Pre-renders the page using Python Playwright (so JS content is fully loaded before the AI sees it)
  - Runs `SmartScraperGraph` with a detailed structured prompt for all 9 allergens
  - Normalises AI output → Allerva row schema (`TRUE`/`FALSE`/`COULD_NOT_VERIFY`)
  - Outputs JSON array to stdout; errors to stderr
- `requirements.txt` — `scrapegraphai`, `langchain-groq`, `langchain-openai`
- `src/scrapers/AIScraper.js` — Node.js bridge:
  - Extends `BaseScraper`, skips Playwright (no browser launched from JS side)
  - Resolves Python 3.12 executable via `LOCALAPPDATA` (fixes PATH mismatch between Git Bash and Windows Python)
  - Spawns `scrape_ai.py`, reads JSON stdout, validates rows
  - Returns empty array if AI fails (chain shows `EMPTY`, safe to resume)
- `src/index.js` — `AIScraper` import, `AI_CHAINS` registry, `--use-ai` CLI flag

#### Bugs fixed during session
| Issue | Fix |
|-------|-----|
| `python` in Git Bash resolves to Python 3.11 (no scrapegraphai) | `AIScraper.js` now uses `LOCALAPPDATA\Programs\Python\Python312\python.exe` directly |
| Space in path `Allerva Data` broke spawn with `shell:true` | Removed `shell:true`; using absolute Python exe path instead |
| `llama-3.1-70b-versatile` decommissioned by Groq | Updated default model to `llama-3.3-70b-versatile` |
| `model_tokens` was inside `llm` dict → rejected by Groq API | Moved `model_tokens: 128_000` to top level of graph config |
| JS-rendered pages returned nav bar only (FetchNode = raw HTML) | Added `fetch_rendered_html()` using Python Playwright before passing to AI |

#### Pilot chain URL status (tested 2026-05-05)
| Chain key | Result | Notes |
|-----------|--------|-------|
| `chipotle` | ✅ **26 rows, HIGH confidence** | Fully validated end-to-end through Node.js |
| `blazepizza` | ⚠️ 0 rows | `/nutrition` is an interactive SPA wizard — allergen data requires user clicks |
| `modpizza` | ❓ not tested | Likely same SPA issue as Blaze |
| `jerseymikes` | ❌ 0 rows | `/allergens` is 404 — URL changed, needs rediscovery |
| `marcospizza` | ❓ not tested | |
| `timhortons` | ❓ not tested | Encoding error on first attempt, retry needed |

#### Validated output sample (Chipotle)
```
Flour Tortilla (Burrito): wheat=TRUE, all others FALSE ✅
Flour Tortilla (Taco):    wheat=TRUE, all others FALSE ✅
Monterey Jack Cheese:     milk=TRUE                    ✅
Queso Blanco:             milk=TRUE                    ✅
Sofritas:                 soy=TRUE                     ✅
Sour Cream:               milk=TRUE                    ✅
Barbacoa:                 all FALSE                    ✅ (correct per Chipotle's published data)
```

#### ⚠️ Cleanup needed before next run
```bash
# Delete stale 0-row checkpoints left from testing
del allerva-scraper\checkpoints\blazepizza.json
del allerva-scraper\checkpoints\chipotle.json   # if you want AI to re-run chipotle
```

#### Next steps for pilot chains
1. **Blaze Pizza / MOD Pizza** — these are interactive SPA wizards. Best approach: intercept the JSON API call (see P3 in HANDOFF, API-First strategy). Not suitable for static AI scraping.
2. **Jersey Mike's** — find current allergen page URL (try: `jerseymikes.com/menu/nutritional-info` or check footer links on their site).
3. **Marco's Pizza** — test `marcos.com/nutrition` with AI.
4. **Tim Hortons** — retry; likely a static nutrition page that should work.
5. Expand `AI_CHAINS` to additional Tier 3 chains with accessible static HTML pages.

### Session 4 — All remaining stubs (THIS SESSION)
- Implemented all 33 remaining stub scrapers (0 stubs left)
- Chains: Whataburger, CrackerBarrel, LongHornSteakhouse, TexasRoadhouse, WaffleHouse, CarlsJr, Hardees, WhiteCastle, SteakNShake, Smashburger, Zaxbys, Bojangles, TimHortons, GoldenCorral, BobEvans, BlazePizza, MarcosPizza, RoundTablePizza, MODPizza, CAVA, Freshii, JustSalad, VeggieGrill, TeriyakiMadness, Jamba, TropicalSmoothieCafe, NoodlesAndCompany, BJsRestaurants, YardHouse, TGIFridays, PFChangs, MoesSouthwestGrill, PeiWei
- Live-tested 4 chains — all fell back to CNV (pages blocked or JS-rendered)
- Screenshots taken for CAVA (PDF link visible), WaffleHouse (blank JS), NoodlesAndCompany (homepage redirect)
- Upgraded CAVA.js to use PDFScraper strategy
- Verified all 53 chains load without errors; 50/53 have KNOWN_ITEMS (3 are live-only: McDonalds, Chipotle, ChickFilA)

### Session 6 — API-First Rollout (2026-05-05)

**Detailed Modification Log:**
*   **2026-05-05 16:40 EST**: Added `waitForApiResponse` to `BaseScraper.js` to enable network interception.
*   **2026-05-05 16:42 EST**: Created `HybridScraper.js` base class for API-first logic.
*   **2026-05-05 16:46 EST**: Refactored `BlazePizza.js` to use API-First strategy (248 rows verified).
*   **2026-05-05 21:05 EST**: Refactored `TimHortons.js` to use Sanity.io GraphQL API (311 items verified).
*   **2026-05-05 21:10 EST**: Updated `HANDOFF.md` with detailed modification logs.

**Tier 1 Promotions:**
*   **Blaze Pizza**: Moved from Tier 3 (CNV) to Tier 1 (Live API).
*   **Tim Hortons**: Moved from Tier 3 (CNV) to Tier 1 (Live API).

---

## Complete Chain Registry (53 chains)

CLI keys for use with --chain or --chains:
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
