'use strict';

const path    = require('path');
const fs      = require('fs');
const { program } = require('commander');
const { logger, validationLogger } = require('./utils/logger');
const checkpoint = require('./checkpoint');
const ExcelWriter = require('./output/ExcelWriter');
const { ALLERGENS, VALID_VALUES } = require('./output/schema');

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
