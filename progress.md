# Allerva Scraper — Chain Progress

Last updated: 2026-05-12\nTotal chains: 53+ | Done (any TRUE data): 57 | Checkpoints exist: 53 | BLOCKED (0 rows): 5

## Legend

| Status | Meaning |
|--------|---------|
| DONE-LIVE | Live browser/API scraping, TRUE/FALSE data, checkpoint exists |
| DONE-PDF | PDF-extracted TRUE/FALSE data, checkpoint exists |
| DONE-AI | AI sidecar (HTML) extracted TRUE/FALSE, checkpoint exists |
| DONE-CNV | Checkpoint exists, no TRUE values (all CNV or FALSE) |
| DATA-ISSUE | Checkpoint exists but data quality poor (all-FALSE, graphical checkboxes, garbled names) |
| BLOCKED | 0-row checkpoint; bot protection, login wall, or content not available |

## All 53 Chains

| CLI Key | Display Name | Status | Rows | Confidence | Strategy | Notes |
|---------|-------------|--------|------|-----------|----------|-------|
| mcdonalds | McDonald's | DONE-LIVE | 212 | HIGH | Live HTML | Nutrition calculator |
| chipotle | Chipotle | DONE-AI | 26 | HIGH | AIScraper HTML | Validated Session 5 |
| chickfila | Chick-fil-A | DONE-LIVE | 161 | HIGH | Live HTML | Allergen accordion |
| blazepizza | Blaze Pizza | DONE-LIVE | 276 | HIGH | HybridScraper | Nutritionix API; re-run 5/6 |
| timhortons | Tim Hortons | DONE-LIVE | 312 | HIGH | HybridScraper | Sanity.io GraphQL; 447 TRUE / 26 CNV |
| wingstop | Wingstop | DONE-PDF | 71 | HIGH | AIScraper PDF | Layout C (dynamic header); 63 rows TRUE; WS_Allergens_8.21.25.pdf |
| fiveguys | Five Guys | DONE-PDF | 94 | HIGH | AIScraper PDF | Jul 2025 allergen guide; 70 rows TRUE |
| subway | Subway | BLOCKED | 0 | — | — | Vertical-text headers; LLM rate-limited; PerimeterX on HTML |
| jimmyjohns | Jimmy John's | DONE-PDF | 60 | MIXED | PDF | JimmyJohnsAllergenInformation.pdf |
| jerseymikes | Jersey Mike's | DONE-CNV | 20 | CNV | CNV | Perplexity data unverified — reverted |
| firehousesubs | Firehouse Subs | DONE-CNV | 16 | CNV | CNV | Perplexity data wrong (only wheat) — reverted |
| potbelly | Potbelly | DONE-CNV | 33 | CNV | CNV | Perplexity data unverified — reverted |
| einsteinbros | Einstein Bros | DONE-AI | 15 | HIGH | Perplexity import | 14 TRUE; SafeBite Mar 2026 (partially real) |
| tacobell | Taco Bell | DONE-CNV | 31 | CNV | CNV | Perplexity data inferred from recipe knowledge — reverted |
| redrobin | Red Robin | DONE-AI | 19 | MIXED | Perplexity import | 18 TRUE; SafeBite Mar 2026 (partial — missing Eggs/Soy on burgers) |
| innoutburger | In-N-Out | DONE-AI | 11 | MIXED | Gemini 2.5 Flash PDF | 7 TRUE; in-n-out.com allergen PDF |
| noodlesandcompany | Noodles & Co | DONE-AI | 58 | HIGH | Gemini 2.5 Flash PDF | 45 TRUE; noodles.com Mar 2026 nutritionals |
| wafflehouse | Waffle House | DONE-CNV | 25 | CNV | CNV | Perplexity data inferred — reverted |
| cava | CAVA | DONE-CNV | 1 | CNV | PDF | Matrix parse broken |
| whataburger | Whataburger | DATA-ISSUE | 35 | — | PDF | All-FALSE; matrix parse broken |
| pandaexpress | Panda Express | DONE-CNV | 24 | CNV | CNV | Perplexity data clearly wrong (zero allergens on Beijing Beef) — reverted |
| raisingcanes | Raising Cane's | DONE-CNV | 6 | CNV | CNV | Perplexity data inferred from SVG table — reverted |
| longhornsteakhouse | LongHorn Steakhouse | DATA-ISSUE | 43 | — | AIScraper PDF | Custom font encoding; all item names garbled (fi-ligature) |
| crackerbarrel | Cracker Barrel | DONE-AI | 105 | MIXED | AIScraper HTML | 165 TRUE / 105 CNV |
| texasroadhouse | Texas Roadhouse | BLOCKED | 0 | — | — | Bot-protected (403) |
| littlecaesars | Little Caesars | DONE-AI | 46 | MIXED | AIScraper HTML | 50 TRUE / 139 CNV |
| sweetgreen | Sweetgreen | DONE-PDF | 126 | MIXED | AIScraper PDF | ctfassets nutrition binder; 19 TRUE / 28 CNV |
| zaxbys | Zaxby's | DONE-AI | 11 | MIXED | AIScraper HTML | Sparse (milkshakes only extracted) |
| modpizza | MOD Pizza | DONE-LIVE | 83 | HIGH | HTML scraper | modpizza.com/allergen/ static table; 64 TRUE / 0 CNV |
| pfchangs | P.F. Chang's | DONE-PDF | 174 | HIGH | AIScraper PDF | 2026 allergen matrix; Layout D text-X; 162 TRUE |
| smashburger | Smashburger | DONE-CNV | 21 | CNV | CNV | Perplexity data suspicious (cheeseburgers missing Milk) — reverted |
| whitecastle | White Castle | DONE-LIVE | 209 | HIGH | HTML JSON scraper | 181 TRUE; embedded JSON in whitecastle.com/about-us/restaurant-menu-ingredient-list |
| carlsjr | Carl's Jr. | DONE-AI | 131 | HIGH | AIScraper HTML | 229 TRUE / 0 CNV |
| hardees | Hardee's | DONE-AI | 131 | HIGH | Gemini 2.5 Flash PDF | 62 TRUE; carlsjr.com shared CKE nutrition PDF |
| steak_n_shake | Steak 'n Shake | DONE-AI | 15 | MIXED | AIScraper HTML | 24 TRUE / 81 CNV |
| bojangles | Bojangles | DONE-PDF | 136 | HIGH | AIScraper PDF | Layout C (merged header); 140 TRUE / 0 CNV |
| qdoba | Qdoba | DONE-PDF | 28 | HIGH | AIScraper PDF | ctfassets allergen guide; 25 TRUE / 0 CNV |
| moes | Moe's Southwest | DONE-AI | 41 | HIGH | AIScraper HTML | 18 TRUE / 8 CNV |
| deltaco | Del Taco | BLOCKED | 0 | — | — | JS SPA; no accessible allergen PDF |
| marcospizza | Marco's Pizza | BLOCKED | 0 | — | — | Interactive Nutritionix tool (paid API) |
| roundtablepizza | Round Table Pizza | DATA-ISSUE | 186 | — | AIScraper PDF | Graphical checkboxes; all cells read as FALSE |
| jamba | Jamba | DONE-AI | 276 | HIGH | AIScraper HTML | 307 TRUE / 0 CNV |
| tgifridays | TGI Fridays | DONE-PDF | 220 | HIGH | AIScraper PDF | May 2025 official PDF; 729 TRUE / 0 CNV |
| bobevans | Bob Evans | DONE-PDF | 22 | MIXED | AIScraper PDF | 53 TRUE / 40 CNV |
| goldencorral | Golden Corral | DONE-AI | 15 | MIXED | Perplexity import | 14 TRUE; SafeBite Mar 2026 (partially real from nutrition PDF) |
| bjsrestaurants | BJ's Restaurants | BLOCKED | 0 | — | — | Allergen guides page is JS-rendered; Scene7 PDF is nutrition-only |
| yardhouse | Yard House | DONE-AI | 195 | HIGH | AIScraper HTML | 485 TRUE / 10 CNV |
| veggiegrill | Veggie Grill | DONE-PDF | 91 | HIGH | AIScraper PDF | GetBento Dec 2025 allergen guide; 86 TRUE |
| freshii | Freshii | DONE-AI | 126 | MIXED | AIScraper HTML | 143 TRUE / 256 CNV |
| justsalad | Just Salad | DONE-PDF | 118 | MIXED | AIScraper PDF | Jun 2024 allergen PDF; 4 TRUE (greens are allergen-free) |
| teriyakimadness | Teriyaki Madness | DATA-ISSUE | 30 | LOW | AIScraper PDF | Text-positioned layout; mostly FALSE/CNV |
| tropicalsmoothie | Tropical Smoothie | DONE-PDF | 2 | MIXED | AIScraper PDF | Very sparse (2 rows only; 3 TRUE) |
| peiwei | Pei Wei | DONE-AI | 34 | MIXED | AIScraper HTML | 23 TRUE / 223 CNV |

---

## Permanently BLOCKED (no further action without OCR or different data source)

| Chain | Reason |
|-------|--------|
| subway | Vertical-text PDF headers confuse direct parser; PerimeterX on HTML |
| texasroadhouse | Website returns 403 on all paths |
| whitecastle | All candidate PDFs crash pdfplumber (likely scanned images) |
| deltaco | JS SPA; no static allergen PDF accessible |
| marcospizza | Nutritionix interactive calculator (paid API) |
| bjsrestaurants | Allergen guides page JS-rendered; Scene7 PDF is nutrition-only |
| hardees | All getmedia PDF URLs return 403 |
| tacobell | Nutritionix iframe + HTTP/2 bot protection on HTML allergen page |
| raisingcanes | Gatsby SPA; 0 content rendered |
| pandaexpress | Bot-blocked HTML (0 chars rendered); no accessible allergen PDF |
| redrobin | Interactive allergen menu tool only; nutritional PDF inaccessible |
| firehousesubs | Interactive nutritional tool only; no allergen PDF |
| potbelly | Interactive nutrition calculator only; no current allergen PDF |
| smashburger | No official allergen PDF; interactive tool only |
| goldencorral | Buffet with search-based tool; no static allergen data |
| einsteinbros | Nutrition guide PDFs only (no allergen columns); interactive tool only |
| wafflehouse | Image poster PDF (not parseable); full nutritionals PDF has no allergen columns |

## Data Quality Issues (require OCR or different source)

| Chain | Issue |
|-------|-------|
| roundtablepizza | 186 rows all-FALSE — graphical image checkboxes; pdfplumber reads blank cells |
| longhornsteakhouse | 43 rows with garbled names — Darden custom font encoding (fi-ligature chars only) |
| teriyakimadness | 30 rows mostly FALSE/CNV — text-positioned PDF; no extractable tables |
| whataburger | 35 rows all-FALSE — matrix parse broken |
| cava | 1 row — matrix parse broken |

