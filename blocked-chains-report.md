# Allerva Scraper — Chains With Missing or Incomplete Allergen Data

**Project:** Allerva — restaurant allergen data scraper covering 53 US chains  
**Date:** 2026-05-11  
**Goal of this document:** Find alternative data sources (PDFs, APIs, HTML pages) for all chains below that have missing or poor-quality allergen data.

For each chain we need: a publicly accessible allergen guide that lists the **Top 9 allergens** (Milk, Eggs, Fish, Shellfish, Tree Nuts, Peanuts, Wheat, Soy, Sesame) per menu item as TRUE/FALSE — ideally as a downloadable PDF or static HTML table from the chain's official `.com` domain.

---

## Category 1 — Completely Blocked (0 rows, no data at all)

These chains returned zero rows. We cannot access any allergen data.

| Chain | Official Site | Why We're Blocked | What We Need |
|-------|--------------|-------------------|--------------|
| **Subway** | subway.com | PDF uses rotated/vertical column headers that PDF parsers cannot read; HTML site is PerimeterX bot-protected | A text-based allergen PDF where column headers are horizontal, OR a direct JSON/API endpoint with allergen data |
| **Texas Roadhouse** | texasroadhouse.com | Every URL on the website returns HTTP 403 — completely bot-blocked | Any publicly accessible allergen PDF or static HTML page not behind Cloudflare |
| **White Castle** | whitecastle.com | All candidate PDFs crash the PDF parser (likely scanned image files with no text layer) | A text-layer PDF (not a scanned image) or HTML allergen page |
| **Del Taco** | deltaco.com | JavaScript SPA with no static allergen PDF on the site | A downloadable allergen PDF or a non-JS allergen page |
| **Marco's Pizza** | marcos.com | Allergen data is behind a paid Nutritionix interactive API — no free public access | A downloadable allergen PDF or static HTML table |
| **BJ's Restaurants** | bjsrestaurants.com | Allergen guide page is JS-rendered; the only PDF found is nutrition-only with no allergen columns | An allergen-specific PDF (not just nutrition/calorie data) |
| **Hardee's** | hardees.com | All getmedia PDF URLs return 403 — Inspire Brands locked them down | Any working PDF URL or alternative allergen page |

---

## Category 2 — Have Item List But No Allergen Data (all COULD_NOT_VERIFY)

These chains have their menu items scraped but every allergen field is unknown. Their websites use interactive JavaScript tools that can't be scraped statically, and we found no downloadable allergen PDF.

| Chain | Official Site | Rows Scraped | Why No Allergen Data | What We Need |
|-------|--------------|-------------|---------------------|--------------|
| **Taco Bell** | tacobell.com | 31 items | Allergen data is inside a Nutritionix iframe; direct HTML page returns HTTP/2 bot protection error | Static allergen PDF or non-iframe allergen page |
| **Potbelly** | potbelly.com | 33 items | Nutrition calculator is fully JS-rendered; last known allergen PDF was from 2016 on a third-party site | Current official allergen PDF (2023 or newer) from potbelly.com |
| **Red Robin** | redrobin.com | 29 items | Interactive allergen menu tool only; nutritional PDF download was inaccessible | Downloadable allergen PDF or static allergen table |
| **Einstein Bros Bagels** | einsteinbros.com | 25 items | Only PDFs available are nutrition guides with calorie/weight data — no allergen columns | A separate allergen guide PDF (not the nutrition guide) |
| **Waffle House** | wafflehouse.com | 25 items | Allergen poster PDF is an image-only scan (not parseable); full nutritionals PDF has no allergen columns | Text-based allergen chart PDF with Top 9 allergens per item |
| **Firehouse Subs** | firehousesubs.com | 16 items | Interactive nutritional tool only; no downloadable allergen chart found | Downloadable allergen chart PDF from firehousesubs.com |
| **Smashburger** | smashburger.com | 21 items | No official allergen PDF found anywhere on smashburger.com | Official allergen PDF or static HTML allergen table |
| **Golden Corral** | goldencorral.com | 21 items | Buffet chain with a search-based interactive tool; no static allergen data exists | Any static allergen reference (PDF or page) for their standard buffet items |
| **Jersey Mike's** | jerseymikes.com | 20 items | Scraper never found accessible allergen data; allergen page did not render content | Static allergen PDF or non-JS allergen page |
| **Panda Express** | pandaexpress.com | 24 items | HTML page renders 0 content (bot-blocked via Cloudflare/JS); no accessible allergen PDF found | Direct allergen PDF URL or non-bot-blocked allergen page |
| **Raising Cane's** | raisingcanes.com | 6 items | Gatsby SPA — Playwright renders a blank shell with no content; no static allergen data | Static allergen PDF or any non-SPA allergen source |
| **CAVA** | cava.com | 1 item | PDF matrix parse is broken; only 1 row extracted from a multi-item allergen guide | A different URL or format for CAVA's allergen PDF |

---

## Category 3 — Data Quality Issues (rows exist but data is wrong or garbled)

These chains have checkpoints with rows, but the allergen data itself is incorrect or unusable.

| Chain | Official Site | Rows | Problem | What Would Fix It |
|-------|--------------|------|---------|------------------|
| **Round Table Pizza** | roundtablepizza.com | 186 | Allergen matrix uses **graphical image checkboxes** — pdfplumber reads them all as blank. All 186 rows are incorrectly all-FALSE | OCR-based PDF reader (e.g. AWS Textract, Google Document AI, Adobe Extract) to read the checkbox images |
| **LongHorn Steakhouse** | longhornsteakhouse.com | 43 | Darden custom font encoding maps every character to a fi-ligature glyph — item names are blank/garbled. Allergen TRUE/FALSE values may be correct but there's no way to match them to items | OCR on the PDF, or a PyMuPDF-based reader with full font remapping, or an HTML allergen page not using the PDF |
| **Whataburger** | whataburger.com | 35 | Allergen matrix parse is broken — all 35 rows show all-FALSE (known to be incorrect for a burger chain) | A different PDF URL or OCR to correctly parse the checkbox matrix |
| **Teriyaki Madness** | teriyakimadness.com | 30 | Text-positioned PDF layout with no extractable table structure; cells are positioned with whitespace rather than table borders — mostly FALSE/COULD_NOT_VERIFY, low confidence | OCR or a different data source; current PDF at teriyakimadness.com/wp-content/uploads/2025/04/TMAD_Allergen-Chart_2025.pdf |

---

## Category 4 — Very Sparse (some data but coverage is incomplete)

These chains technically have allergen data but extraction was too limited to be useful.

| Chain | Official Site | Rows | Problem | What Would Fix It |
|-------|--------------|------|---------|------------------|
| **Zaxby's** | zaxbys.com | 11 | Only milkshake items were extracted from the HTML page — the main menu was not captured | A full allergen PDF or a different HTML URL that shows the complete menu |
| **Tropical Smoothie Cafe** | tropicalsmoothiecafe.com | 2 | Only 2 items extracted from their PDF; chain has 50+ menu items | A more complete allergen PDF or updated URL |
| **In-N-Out Burger** | in-n-out.com | 11 | PDF extraction got basic ingredients but only 11 rows; their allergen guide covers ~30+ items | Same PDF re-run with improved parser, or alternative source |
| **Steak 'n Shake** | steaknshake.com | 15 | Sparse HTML extraction; chain has significantly more menu items | A full allergen PDF or more complete HTML allergen page |

---

## Summary

| Category | Count | Chains |
|----------|-------|--------|
| Completely blocked (0 rows) | 7 | Subway, Texas Roadhouse, White Castle, Del Taco, Marco's Pizza, BJ's Restaurants, Hardee's |
| Item list only, no allergen data | 12 | Taco Bell, Potbelly, Red Robin, Einstein Bros, Waffle House, Firehouse Subs, Smashburger, Golden Corral, Jersey Mike's, Panda Express, Raising Cane's, CAVA |
| Data quality issues (wrong/garbled data) | 4 | Round Table Pizza, LongHorn Steakhouse, Whataburger, Teriyaki Madness |
| Very sparse (incomplete coverage) | 4 | Zaxby's, Tropical Smoothie Cafe, In-N-Out Burger, Steak 'n Shake |
| **Total chains needing attention** | **27** | |

---

## What We're Looking For

For each chain above, any of the following would unblock scraping:

1. **Direct PDF URL** — a downloadable `.pdf` file from the chain's official `.com` domain containing a table with Top 9 allergens (Milk, Eggs, Fish, Shellfish, Tree Nuts, Peanuts, Wheat, Soy, Sesame) marked per item. Must be text-based (not a scanned image).

2. **Static HTML allergen page** — a page that renders allergen data in plain HTML without requiring JavaScript interaction or login. Should be accessible via a standard browser without bot protection.

3. **Public API endpoint** — a JSON or XML endpoint that returns menu items with allergen flags (not behind a paid API wall like Nutritionix).

4. **OCR-ready PDF** — for chains with graphical checkbox PDFs (Round Table Pizza, Whataburger), confirmation that an OCR service like AWS Textract or Google Document AI can read the checkbox images correctly.

**Source requirement:** Official chain `.com` domain only — no third-party nutrition databases, no user-generated content sites.
