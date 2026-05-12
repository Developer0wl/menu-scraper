'use strict';

const path    = require('path');
const fs      = require('fs');
const { program } = require('commander');
const { logger, validationLogger } = require('./utils/logger');
const checkpoint = require('./checkpoint');
const ExcelWriter = require('./output/ExcelWriter');
const { ALLERGENS, VALID_VALUES } = require('./output/schema');
const AIScraper = require('./scrapers/AIScraper');

// ── AI pilot set — Tier 3 chains upgraded via ScrapeGraphAI ────────────────
// Activate with: node src/index.js --chain <key> --use-ai
// Requires: pip install -r requirements.txt && playwright install chromium (Python)
// Set env: GROQ_API_KEY (default provider) or OPENAI_API_KEY or start Ollama
// blazepizza + timhortons use their own HybridScraper natively — NOT listed here
const AI_CHAINS = {
  // Validated ✅
  chipotle:           { chainName: 'Chipotle',            officialUrl: 'https://www.chipotle.com/allergens' },
  jerseymikes:        { chainName: 'JerseyMikes',         officialUrl: 'https://www.jerseymikes.com/menu/food-allergy' },
  marcospizza:        { chainName: 'MarcosPizza',         officialUrl: 'https://www.marcos.com/nutrition' },

  // Bucket A — static HTML (AI scraper)
  longhornsteakhouse: { chainName: 'LongHornSteakhouse',  officialUrl: 'https://media.longhornsteakhouse.com/en_us/pdf/longhorn_allergen_guide.pdf' },
  crackerbarrel:      { chainName: 'CrackerBarrel',       officialUrl: 'https://www.crackerbarrel.com/-/media/Project/cb-brandsite/brandsite/pdfs/AllergenGuide.pdf' },
  texasroadhouse:     { chainName: 'TexasRoadhouse',      officialUrl: 'https://www.texasroadhouse.com/nutritional-information' },
  littlecaesars:      { chainName: 'LittleCaesars',       officialUrl: 'https://littlecaesars.com/static/usnutritionguide.pdf' },
  zaxbys:             { chainName: 'Zaxbys',              officialUrl: 'https://www.zaxbys.com/nutrition' },
  smashburger:        { chainName: 'Smashburger',         officialUrl: 'https://www.smashburger.com/menu/nutrition' },
  whitecastle:        { chainName: 'WhiteCastle',         officialUrl: 'https://www.whitecastle.com/pdfs/nutrition/White-Castle-Ingredient-List.pdf' },
  carlsjr:            { chainName: 'CarlsJr',             officialUrl: 'https://www.carlsjr.com/getContentAsset/86ac3f5e-5c97-4a18-9e27-7a6d62a9148f/dfc3d011-8f63-43f6-9ed8-4b444333a1d0/cj-25w5-sys_np-dig-1120x3000_r0.pdf?language=en-US' },
  hardees:            { chainName: 'Hardees',             officialUrl: 'https://www.hardees.com/getmedia/c71a87a7-8a11-475e-b3d5-b22ece7b8b2b/HD-24W3-SYS_NP-0012_Cropped_r0.pdf' },
  steak_n_shake:      { chainName: 'SteakNShake',         officialUrl: 'https://cos-steak-n-shake.s3.us-west-2.amazonaws.com/production/wp-content/uploads/2025/05/06185649/SNS_National-_May2025_No_Price.pdf' },
  bojangles:          { chainName: 'Bojangles',           officialUrl: 'https://storyblok.pleinaircdn.com/f/110020/x/6da88a04c9/nutrition-guide-updated-v2_2-8-24.pdf' },
  moes:               { chainName: 'MoesSouthwestGrill',  officialUrl: 'https://assets.ctfassets.net/zqt8tllj2cy0/3Mh9GkDGVQcrIzQUpCyspY/200f37e957b84ee8079d54a5863dce51/Moes-Allergen-Chart-20250228-V2.pdf' },
  deltaco:            { chainName: 'DelTaco',             officialUrl: 'https://deltaco.com/files/pdf/allergens.pdf' },
  roundtablepizza:    { chainName: 'RoundTablePizza',     officialUrl: 'https://koala-configurations.s3.us-east-1.amazonaws.com/public/assets/allergen-information-10-6-22-marketing-production-2920.pdf' },
  jamba:              { chainName: 'Jamba',               officialUrl: 'https://assets.ctfassets.net/zqt8tllj2cy0/6QMmAUCCRZGEeFYHyZDPOs/fdb40483a66ef64dc61c438e2e80b556/Jamba_Nutrition_Spreadsheet_-_May_2026-1.pdf' },
  tgifridays:         { chainName: 'TGIFridays',          officialUrl: 'https://tgifridays.com/wp-content/uploads/2025/05/TGI-Fridays-SYSTEM-ANI-Document-May-2025-Rollout-sent-05.07.2025.pdf' },
  goldencorral:       { chainName: 'GoldenCorral',        officialUrl: 'https://www.goldencorral.com/nutrition/' },
  bjsrestaurants:     { chainName: 'BJsRestaurants',      officialUrl: 'https://bjsrestaurants.scene7.com/is/content/bjsrestaurants/0924_BJS_NUTRI_92425pdf' },
  yardhouse:          { chainName: 'YardHouse',           officialUrl: 'https://media.yardhouse.com/en_us/pdf/Nutrition_Dietary_Allergen_Guide.pdf' },
  veggiegrill:        { chainName: 'VeggieGrill',         officialUrl: 'https://media-cdn.getbento.com/accounts/0879d48e96f07deb9c3248ba98650536/media/iNqCliEtT46talepiiyY_AAV%202.0%20Allergen%20Guide%2012.25.pdf' },
  freshii:            { chainName: 'Freshii',             officialUrl: 'https://freshii.com/wp-content/uploads/2025/08/Freshii-N_A-Guide-2025-V2.2-EN.pdf' },
  justsalad:          { chainName: 'JustSalad',           officialUrl: 'https://cdn1.justsalad.com/public/Just_Salad_Allergen_Guide_JUN24.pdf' },
  teriyakimadness:    { chainName: 'TeriyakiMadness',     officialUrl: 'https://teriyakimadness.com/wp-content/uploads/2025/04/TMAD_Allergen-Chart_2025.pdf' },
  tropicalsmoothie:   { chainName: 'TropicalSmoothieCafe', officialUrl: 'https://www.tropicalsmoothiecafe.com/nutrition' },
  peiwei:             { chainName: 'PeiWei',              officialUrl: 'https://www.peiwei.com/nutrition' },
  pfchangs:           { chainName: 'PFChangs',            officialUrl: 'https://www.pfchangs.com/docs/default-source/pdf/pfc-national-menu-allergens-2026.pdf' },
  jimmyjohns:         { chainName: 'JimmyJohns',          officialUrl: 'https://resources.jimmyjohns.com/downloadable-files/JimmyJohnsAllergenInformation.pdf' },
  bobevans:           { chainName: 'BobEvans',            officialUrl: 'https://assets.ctfassets.net/81w9kb7f1jq4/3XhvWxXW7Mo7JNOfBzWVB2/88c78d1621ffe9ab7c9007db49ef7f74/Allergens_SpringFY20.pdf' },
  fiveguys:           { chainName: 'FiveGuys',            officialUrl: 'https://www.fiveguys.com/wp-content/uploads/2025/07/five-guys-us-nutrition-allergen-guide-english-1-final.pdf' },

  // Wingstop + Subway — PDF direct links (no bot protection on PDF server)
  wingstop:           { chainName: 'Wingstop',            officialUrl: 'https://s3.amazonaws.com/wingstop.com/assets/static/WS_Allergens_8.21.25.pdf' },
  subway:             { chainName: 'Subway',              officialUrl: 'https://www.subway.com/en-us/-/media/northamerica/usa/nutrition/nutritiondocuments/2025/us_allergens_eng_1-21-25.pdf' },

  // Bucket B — HybridScraper now live for MODPizza; Sweetgreen/Qdoba still intercepting
  sweetgreen:         { chainName: 'Sweetgreen',          officialUrl: 'https://assets.ctfassets.net/eum7w7yri3zr/7qzNkzyPBQBya7k1CdhWqg/09492fe3cff02335d09d4a552136eff3/Nutrition_Overview_P5_24__1_.pdf' },
  qdoba:              { chainName: 'Qdoba',               officialUrl: 'https://assets.ctfassets.net/0tc4847zqy12/7tWiboNUIeUEUPTSgoTufu/ae51f412127293706bcdd6515ad898eb/Allergen-Guide-Published-on-04-23-2024-QDOBA-Mexican-Eats.pdf' },

  // Session 9 — CNV chain fixes (PDF where available, HTML fallback)
  innoutburger:       { chainName: 'InNOutBurger',        officialUrl: 'https://www.in-n-out.com/docs/default-source/downloads/in-n-out_allergen_info.pdf' },
  einsteinbros:       { chainName: 'EinsteinBros',        officialUrl: 'https://www.einsteinbros.com/wp-content/uploads/2026/02/Einstein-Bros-Bagels-Nutrition-Guide-2026.pdf' },
  wafflehouse:        { chainName: 'WaffleHouse',         officialUrl: 'https://www.wafflehouse.com/wp-content/uploads/2024/03/Waffle_House_Full-Nutritionals_-v20.2-7.17.19.pdf' },
  noodlesandcompany:  { chainName: 'NoodlesAndCompany',   officialUrl: 'https://www.noodles.com/sites/default/files/2026-03/NTR_0326_r3.pdf' },
  firehousesubs:      { chainName: 'FirehouseSubs',       officialUrl: 'https://www.firehousesubs.com/nutritional-information' },
  redrobin:           { chainName: 'RedRobin',            officialUrl: 'https://www.redrobin.com/sites/default/files/2023-12/0124_NS_US-ALL.pdf' },
  potbelly:           { chainName: 'Potbelly',            officialUrl: 'https://www.potbelly.com/nutrition-calculator' },
  smashburger:        { chainName: 'Smashburger',         officialUrl: 'https://smashburger.com/eat/nutrition-allergen/' },
  pandaexpress:       { chainName: 'PandaExpress',        officialUrl: 'https://www.pandaexpress.com/nutritioninformation' },
  raisingcanes:       { chainName: 'RaisingCanes',        officialUrl: 'https://www.raisingcanes.com/allergens/' },
  tacobell:           { chainName: 'TacoBell',            officialUrl: 'https://www.tacobell.com/nutrition/allergens' },

  // Session 9 — retry with AI scraper
  cava:               { chainName: 'CAVA',               officialUrl: 'https://cava.com/menu/nutrition' },
  whataburger:        { chainName: 'Whataburger',         officialUrl: 'https://whataburger.com/food/allergens' },

  // Session 9 — Hardee's uses Carl's Jr. shared PDF (CKE Restaurants parent)
  hardees:            { chainName: 'Hardees',             officialUrl: 'https://www.carlsjr.com/getContentAsset/cccf694a-3d94-4cbc-adfc-28c255939f92/dfc3d011-8f63-43f6-9ed8-4b444333a1d0/nutritional-info.pdf?language=en-US' },
};

// ── Registry of all chain scrapers ─────────────────────────────────────────
// Remaining scrapers are stubs — add implementations before running --all
const SCRAPERS = {
  mcdonalds:          () => new (require('./scrapers/McDonalds'))(),
  // Stubs — swap for full implementations in Step 8
  wingstop:           () => new (require('./scrapers/Wingstop'))(),
  fiveguys:           () => new (require('./scrapers/FiveGuys'))(),
  chipotle:           () => new (require('./scrapers/Chipotle'))(),
  innoutburger:       () => new (require('./scrapers/InNOutBurger'))(),
  chickfila:          () => new (require('./scrapers/ChickFilA'))(),
  subway:             () => new (require('./scrapers/Subway'))(),
  whataburger:        () => new (require('./scrapers/Whataburger'))(),
  longhornsteakhouse: () => new (require('./scrapers/LongHornSteakhouse'))(),
  crackerbarrel:      () => new (require('./scrapers/CrackerBarrel'))(),
  tacobell:           () => new (require('./scrapers/TacoBell'))(),
  texasroadhouse:     () => new (require('./scrapers/TexasRoadhouse'))(),
  raisingcanes:       () => new (require('./scrapers/RaisingCanes'))(),
  jerseymikes:        () => new (require('./scrapers/JerseyMikes'))(),
  jimmyjohns:         () => new (require('./scrapers/JimmyJohns'))(),
  redrobin:           () => new (require('./scrapers/RedRobin'))(),
  littlecaesars:      () => new (require('./scrapers/LittleCaesars'))(),
  sweetgreen:         () => new (require('./scrapers/Sweetgreen'))(),
  cava:               () => new (require('./scrapers/CAVA'))(),
  zaxbys:             () => new (require('./scrapers/Zaxbys'))(),
  blazepizza:         () => new (require('./scrapers/BlazePizza'))(),
  modpizza:           () => new (require('./scrapers/MODPizza'))(),
  noodlesandcompany:  () => new (require('./scrapers/NoodlesAndCompany'))(),
  pfchangs:           () => new (require('./scrapers/PFChangs'))(),
  timhortons:         () => new (require('./scrapers/TimHortons'))(),
  smashburger:        () => new (require('./scrapers/Smashburger'))(),
  whitecastle:        () => new (require('./scrapers/WhiteCastle'))(),
  carlsjr:            () => new (require('./scrapers/CarlsJr'))(),
  hardees:            () => new (require('./scrapers/Hardees'))(),
  steak_n_shake:      () => new (require('./scrapers/SteakNShake'))(),
  bojangles:          () => new (require('./scrapers/Bojangles'))(),
  qdoba:              () => new (require('./scrapers/Qdoba'))(),
  moes:               () => new (require('./scrapers/MoesSouthwestGrill'))(),
  deltaco:            () => new (require('./scrapers/DelTaco'))(),
  marcospizza:        () => new (require('./scrapers/MarcosPizza'))(),
  roundtablepizza:    () => new (require('./scrapers/RoundTablePizza'))(),
  firehousesubs:      () => new (require('./scrapers/FirehouseSubs'))(),
  potbelly:           () => new (require('./scrapers/Potbelly'))(),
  jamba:              () => new (require('./scrapers/Jamba'))(),
  einsteinbros:       () => new (require('./scrapers/EinsteinBrosBagels'))(),
  tgifridays:         () => new (require('./scrapers/TGIFridays'))(),
  bobevans:           () => new (require('./scrapers/BobEvans'))(),
  goldencorral:       () => new (require('./scrapers/GoldenCorral'))(),
  bjsrestaurants:     () => new (require('./scrapers/BJsRestaurants'))(),
  yardhouse:          () => new (require('./scrapers/YardHouse'))(),
  wafflehouse:        () => new (require('./scrapers/WaffleHouse'))(),
  pandaexpress:       () => new (require('./scrapers/PandaExpress'))(),
  peiwei:             () => new (require('./scrapers/PeiWei'))(),
  teriyakimadness:    () => new (require('./scrapers/TeriyakiMadness'))(),
  freshii:            () => new (require('./scrapers/Freshii'))(),
  veggiegrill:        () => new (require('./scrapers/VeggieGrill'))(),
  justsalad:          () => new (require('./scrapers/JustSalad'))(),
  tropicalsmoothie:   () => new (require('./scrapers/TropicalSmoothieCafe'))(),
};

const ALL_CHAIN_KEYS = Object.keys(SCRAPERS);

// ── CLI definition ──────────────────────────────────────────────────────────
program
  .name('allerva-scraper')
  .description('Allerva life-safety allergen scraper')
  .option('--all',              'Run all chains sequentially')
  .option('--chain <name>',     'Run a single chain by key name (e.g. mcdonalds)')
  .option('--chains <list>',    'Comma-separated chain keys (e.g. mcdonalds,tacobell)')
  .option('--resume',           'Skip chains that already have a checkpoint file')
  .option('--dry-run',          'Extract and log data but do not write Excel output')
  .option('--validate',         'Re-validate existing output without re-scraping')
  .option('--use-ai',           'Use ScrapeGraphAI for supported Tier 3 chains (see AI_CHAINS in index.js)')
  .parse(process.argv);

const opts = program.opts();

// ── Validation pass ─────────────────────────────────────────────────────────
function validateRows(chainName, discoveredCount, rows) {
  const total = rows.length;
  if (discoveredCount > 0 && total > 0) {
    const gap = Math.abs(discoveredCount - total) / discoveredCount;
    if (gap > 0.05) {
      validationLogger.warn(`Item count gap: discovered=${discoveredCount} extracted=${total} (${(gap * 100).toFixed(1)}%)`,
        { chain: chainName });
    }
  }

  let allFalseCount = 0;
  let allTrueCount  = 0;
  let badValueCount = 0;

  for (const row of rows) {
    const vals = ALLERGENS.map(a => row[a]);

    if (vals.every(v => v === 'FALSE')) {
      allFalseCount++;
      validationLogger.warn(`All-FALSE row: "${row.itemName}"`, { chain: chainName });
    }
    if (vals.every(v => v === 'TRUE')) {
      allTrueCount++;
      validationLogger.warn(`All-TRUE row: "${row.itemName}"`, { chain: chainName });
    }
    for (const allergen of ALLERGENS) {
      if (!VALID_VALUES.has(row[allergen])) {
        badValueCount++;
        validationLogger.error(`Bad value "${row[allergen]}" for ${allergen} in "${row.itemName}" — overwriting with COULD_NOT_VERIFY`,
          { chain: chainName });
        row[allergen] = 'COULD_NOT_VERIFY';
      }
    }
  }

  validationLogger.info('Validation summary', {
    chain: chainName,
    totalRows: total,
    allFalseRows: allFalseCount,
    allTrueRows:  allTrueCount,
    badValueCells: badValueCount,
  });
}

// ── Run a single chain ───────────────────────────────────────────────────────
async function runChain(chainKey, writer, dryRun, resume) {
  const scraperFactory = SCRAPERS[chainKey];
  if (!scraperFactory) {
    logger.error(`Unknown chain key: "${chainKey}"`, {});
    return { chainKey, status: 'ERROR', rows: [] };
  }

  // Resume: skip if checkpoint exists
  if (resume) {
    const existing = checkpoint.load(chainKey);
    if (existing) {
      logger.info(`Resuming — skipping "${chainKey}" (checkpoint exists with ${existing.rowCount} rows)`, {});
      if (!dryRun && writer) {
        writer.addChainSheet(chainKey, existing.rows, 'OK');
      }
      return { chainKey, status: 'RESUMED', rows: existing.rows };
    }
  }

  const scraper = scraperFactory();
  let rows   = [];
  let status = 'OK';

  try {
    await scraper.init();
    rows = await scraper.scrape();

    validateRows(chainKey, scraper._discoveredCount || rows.length, rows);

    checkpoint.save(chainKey, rows);
    logger.info(`Checkpoint saved for "${chainKey}" (${rows.length} rows)`, {});

    if (rows.length === 0) status = 'EMPTY';
  } catch (err) {
    logger.error(`Chain "${chainKey}" threw an unhandled error: ${err.message}`, { stack: err.stack });
    status = 'ERROR';
  } finally {
    await scraper.close();
  }

  if (!dryRun && writer && rows.length > 0) {
    writer.addChainSheet(chainKey, rows, status);
  }

  return { chainKey, status, rows };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const dryRun = !!opts.dryRun;
  const resume = !!opts.resume;
  const useAI  = !!opts.useAi;

  // Determine which chains to run
  let chainsToRun = [];
  if (opts.all) {
    chainsToRun = ALL_CHAIN_KEYS;
  } else if (opts.chains) {
    chainsToRun = opts.chains.split(',').map(s => s.trim().toLowerCase());
  } else if (opts.chain) {
    chainsToRun = [opts.chain.trim().toLowerCase()];
  } else {
    logger.error('No chain specified. Use --all, --chain <name>, or --chains <a,b,c>');
    process.exit(1);
  }

  // Inject AI scrapers for any chain in the pilot set when --use-ai is active
  if (useAI) {
    for (const [key, config] of Object.entries(AI_CHAINS)) {
      if (chainsToRun.includes(key)) {
        SCRAPERS[key] = () => new AIScraper(config);
        logger.info(`AI scraper enabled for: ${key}`, {});
      }
    }
  }

  logger.info(`Allerva scraper starting`, {
    chains: chainsToRun,
    dryRun,
    resume,
    timestamp: new Date().toISOString(),
  });

  // Output file
  const outputDir = path.resolve(__dirname, '..', 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const datestamp  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outputFile = path.join(outputDir, `allerva-${datestamp}.xlsx`);
  const writer     = dryRun ? null : new ExcelWriter(outputFile);

  const results = [];
  for (const chainKey of chainsToRun) {
    const result = await runChain(chainKey, writer, dryRun, resume);
    results.push(result);
    logger.info(`Chain complete: ${chainKey} — ${result.rows.length} rows, status: ${result.status}`, {});

    // Print first 10 rows as JSON in dry-run mode for quick inspection
    if (dryRun && result.rows.length > 0) {
      const preview = result.rows.slice(0, 10);
      logger.info(`--- DRY RUN PREVIEW: first ${preview.length} rows ---`, { chain: chainKey });
      preview.forEach((r, i) => {
        logger.info(`Row ${i + 1}: ${JSON.stringify({
          itemName:    r.itemName,
          category:    r.menuCategory,
          milk:        r.milk,
          eggs:        r.eggs,
          fish:        r.fish,
          shellfish:   r.shellfish,
          treeNuts:    r.treeNuts,
          peanuts:     r.peanuts,
          wheat:       r.wheat,
          soy:         r.soy,
          sesame:      r.sesame,
          crossContact: r.crossContact,
          confidence:  r.confidence,
          sourceText:  r.sourceText ? r.sourceText.slice(0, 80) : '',
        })}`, {});
      });
    }
  }

  // Write Excel
  if (!dryRun && writer) {
    writer.addSummarySheet();
    const savedPath = await writer.save();
    logger.info(`Excel output saved: ${savedPath}`, {});
  }

  // Final summary
  const totalRows = results.reduce((n, r) => n + r.rows.length, 0);
  logger.info(`Run complete — ${results.length} chains, ${totalRows} total rows`, {});
  results.forEach(r => logger.info(`  ${r.chainKey}: ${r.rows.length} rows [${r.status}]`, {}));

  if (dryRun) {
    logger.info('DRY RUN complete — no Excel file written.', {});
  }
}

main().catch(err => {
  logger.error(`Fatal error: ${err.message}`, { stack: err.stack });
  process.exit(1);
});
