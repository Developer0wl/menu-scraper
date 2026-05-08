# Allerva Scraper — Chain Progress

Last updated: 2026-05-07
Total chains: 53 | Done (any TRUE data): 21 | Checkpoints exist: 44 | BLOCKED (0 rows): 9

## Legend

| Status | Meaning |
|--------|---------|
| DONE-LIVE | Live browser/API scraping, TRUE/FALSE data, checkpoint exists |
| DONE-PDF | PDF-extracted TRUE/FALSE data, checkpoint exists |
| DONE-AI | AI sidecar (HTML) extracted TRUE/FALSE, checkpoint exists |
| DONE-CNV | Checkpoint exists, no TRUE values (all CNV or FALSE) |
| DATA-ISSUE | Checkpoint exists but data quality poor (all-FALSE, graphical checkboxes) |
| BLOCKED | 0-row checkpoint; bot protection, login wall, or content not available |

## All 53 Chains

| CLI Key | Display Name | Status | Rows | Confidence | Strategy | Notes |
|---------|-------------|--------|------|-----------|----------|-------|
| mcdonalds | McDonald's | DONE-LIVE | 212 | HIGH | Live HTML | Nutrition calculator |
| chipotle | Chipotle | DONE-AI | 26 | HIGH | AIScraper HTML | Validated Session 5 |
| chickfila | Chick-fil-A | DONE-LIVE | 161 | HIGH | Live HTML | Allergen accordion |
| blazepizza | Blaze Pizza | DONE-LIVE | 276 | HIGH | HybridScraper | Nutritionix API; re-run 5/6 |
| timhortons | Tim Hortons | DONE-LIVE | 312 | HIGH | HybridScraper | Sanity.io GraphQL; 447 TRUE / 26 CNV |
| wingstop | Wingstop | DONE-CNV | 48 | CNV | PDF | Column parse issue |
| fiveguys | Five Guys | DONE-CNV | 25 | CNV | PDF | Checkpoint overwritten by failed AI run; re-run native to restore |
| subway | BLOCKED | Subway | 0 | — | — | PerimeterX bot protection |
| jimmyjohns | Jimmy John's | DONE-PDF | 60 | MIXED | PDF | JimmyJohnsAllergenInformation.pdf |
| jerseymikes | Jersey Mike's | DONE-CNV | 20 | CNV | CNV | |
| firehousesubs | Firehouse Subs | DONE-CNV | 16 | CNV | CNV | |
| potbelly | Potbelly | DONE-CNV | 33 | CNV | CNV | |
| einsteinbros | Einstein Bros | DONE-CNV | 25 | CNV | CNV | |
| tacobell | Taco Bell | DONE-CNV | 31 | CNV | CNV | Nutritionix iframe |
| redrobin | Red Robin | DONE-CNV | 29 | CNV | CNV | |
| innoutburger | In-N-Out | DONE-CNV | 20 | CNV | CNV | |
| noodlesandcompany | Noodles & Co | DONE-CNV | 18 | CNV | CNV | |
| wafflehouse | Waffle House | DONE-CNV | 25 | CNV | CNV | |
| cava | CAVA | DONE-CNV | 1 | CNV | PDF | Matrix parse broken |
| whataburger | Whataburger | DATA-ISSUE | 35 | — | PDF | All-FALSE; matrix parse or bot-page |
| pandaexpress | Panda Express | DONE-CNV | 24 | CNV | CNV | |
| raisingcanes | Raising Cane's | DONE-CNV | 6 | CNV | CNV | Gatsby SPA |
| longhornsteakhouse | LongHorn Steakhouse | DONE-CNV | 26 | CNV | AIScraper | PDF returns all-FALSE; KNOWN_ITEMS fallback active (needs GROQ_API_KEY) |
| crackerbarrel | Cracker Barrel | DONE-AI | 105 | MIXED | AIScraper HTML | 165 TRUE / 105 CNV |
| texasroadhouse | Texas Roadhouse | BLOCKED | 0 | — | — | Bot-protected |
| littlecaesars | Little Caesars | DONE-AI | 46 | MIXED | AIScraper HTML | 50 TRUE / 139 CNV |
| sweetgreen | Sweetgreen | BLOCKED | 0 | — | — | SPA, no API intercepted |
| zaxbys | Zaxby's | DONE-AI | 11 | MIXED | AIScraper HTML | Sparse (milkshakes only extracted) |
| modpizza | MOD Pizza | DONE-LIVE | 83 | HIGH | HTML scraper | modpizza.com/allergen/ static table; 64 TRUE / 0 CNV |
| pfchangs | P.F. Chang's | BLOCKED | 0 | — | — | Bot-protected |
| smashburger | Smashburger | DONE-CNV | 21 | CNV | AIScraper | Interactive widget; AI got page shell only |
| whitecastle | White Castle | BLOCKED | 0 | — | — | PDF 404 + SPA |
| carlsjr | Carl's Jr. | DONE-AI | 131 | HIGH | AIScraper HTML | 229 TRUE / 0 CNV |
| hardees | Hardee's | BLOCKED | 0 | — | — | PDF 403 |
| steak_n_shake | Steak 'n Shake | DONE-AI | 15 | MIXED | AIScraper HTML | 24 TRUE / 81 CNV |
| bojangles | Bojangles | DONE-PDF | 134 | HIGH | AIScraper PDF | Layout C (merged header); 140 TRUE / 0 CNV |
| qdoba | Qdoba | BLOCKED | 0 | — | — | Cloudflare |
| moes | Moe's Southwest | DONE-AI | 41 | HIGH | AIScraper HTML | 18 TRUE / 8 CNV |
| deltaco | Del Taco | BLOCKED | 0 | — | — | Bot-protected |
| marcospizza | Marco's Pizza | BLOCKED | 0 | — | — | Interactive nutrition tool |
| roundtablepizza | Round Table Pizza | DATA-ISSUE | 186 | — | AIScraper PDF | Graphical checkboxes; all cells read as FALSE |
| jamba | Jamba | DONE-AI | 276 | HIGH | AIScraper HTML | 307 TRUE / 0 CNV |
| tgifridays | TGI Fridays | DONE-AI | 15 | LOW | AIScraper HTML | Only 4 TRUE cells; sparse extraction |
| bobevans | Bob Evans | DONE-PDF | 22 | MIXED | AIScraper PDF | 53 TRUE / 40 CNV |
| goldencorral | Golden Corral | DONE-CNV | 21 | CNV | AIScraper | Buffet search tool; AI got page shell only |
| bjsrestaurants | BJ's Restaurants | BLOCKED | 0 | — | — | Scene7 PDF is nutrition-only (no allergen cols) |
| yardhouse | Yard House | DONE-AI | 195 | HIGH | AIScraper HTML | 485 TRUE / 10 CNV |
| veggiegrill | Veggie Grill | BLOCKED | 0 | — | — | GetBento PDF is nutrition-only (no allergen cols) |
| freshii | Freshii | DONE-AI | 126 | MIXED | AIScraper HTML | 143 TRUE / 256 CNV |
| justsalad | Just Salad | DONE-CNV | 14 | CNV | AIScraper+PDF | PDF fallback returned CNV |
| teriyakimadness | Teriyaki Madness | DATA-ISSUE | 30 | LOW | AIScraper PDF | Text-positioned layout; mostly FALSE/CNV |
| tropicalsmoothie | Tropical Smoothie | DONE-PDF | 2 | MIXED | AIScraper PDF | Very sparse (2 rows only) |
| peiwei | Pei Wei | DONE-AI | 34 | MIXED | AIScraper HTML | 23 TRUE / 223 CNV |

---

## Chains Needing Attention

### Requires GROQ_API_KEY (`$env:GROQ_API_KEY = "..."`)
All `--use-ai` chains are blocked until the key is set in the session. Run this batch once key is available:
```
node src/index.js --chains zaxbys,tgifridays,justsalad,teriyakimadness,wingstop,subway,deltaco,whitecastle,qdoba,sweetgreen,fiveguys,longhornsteakhouse --use-ai
```

### Need allergen-specific PDFs
- **bjsrestaurants** — Scene7 URL is nutrition PDF. Search bjsrestaurants.com for allergen guide PDF
- **veggiegrill** — GetBento URL is nutrition PDF. Search veggiegrill.com for allergen guide PDF

### Data quality issues (require deeper fix)
- **roundtablepizza** — Graphical/image checkboxes. pdfplumber reads them as empty → FALSE. Needs OCR or different source
- **longhornsteakhouse** — 39 rows all-FALSE. Re-run to confirm; if still all-FALSE, likely bot-page
- **teriyakimadness** — Text-positioned PDF (0 pdfplumber tables). Unicode ✓ present but LLM not parsing reliably
- **whataburger** — 35 rows all-FALSE. Matrix parse broken

### SPA / interactive (needs HybridScraper implementation)
- **sweetgreen** — React SPA; need to intercept api.sweetgreen.com API calls
- **modpizza** — Build-your-own wizard; need to intercept Nutritionix API
- **qdoba** — Cloudflare; XHR calls may succeed after page load
