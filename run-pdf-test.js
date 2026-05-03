'use strict';

/**
 * PDF extraction test — runs PDFScraper against 5 PDF-only chains.
 * Prints: download status, items extracted, first 5 rows as JSON.
 */

const PDFScraper = require('./src/scrapers/PDFScraper');

const PDF_CHAINS = [
  {
    chainName:   'RaisingCanes',
    pdfUrl:      'https://www.raisingcanes.com/sites/default/files/pdf/allergen_information.pdf',
    officialUrl: 'https://www.raisingcanes.com/allergens',
  },
  {
    chainName:   'PandaExpress',
    pdfUrl:      'https://www.pandaexpress.com/content/dam/pandaexpress/documents/nutrition/Allergen_Guide.pdf',
    officialUrl: 'https://www.pandaexpress.com/usca/en/allergens',
  },
  {
    chainName:   'Wingstop',
    pdfUrl:      'https://cdn.bfldr.com/NDQASMJ1/as/2v4qqb9ww8mvcm64gnh7ktnc/WS_Allergens_1226_2',
    officialUrl: 'https://www.wingstop.com/allergens',
  },
  {
    chainName:   'FiveGuys',
    pdfUrl:      'https://www.fiveguys.com/wp-content/uploads/2025/07/five-guys-us-nutrition-allergen-guide-english-1-final.pdf',
    officialUrl: 'https://www.fiveguys.com/nutritional-allergy-information/',
  },
  {
    chainName:   'InNOutBurger',
    pdfUrl:      'https://www.in-n-out.com/docs/default-source/downloads/in-nout_allergen_info.pdf',
    officialUrl: 'https://www.in-n-out.com/nutrition',
  },
];

async function runPDFChain(cfg) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`PDF: ${cfg.chainName}`);
  console.log(`URL: ${cfg.pdfUrl}`);
  const scraper = new PDFScraper(cfg);
  let rows = [];
  try {
    rows = await scraper.scrape();
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
    return { chainName: cfg.chainName, success: false, rows: 0 };
  }

  if (rows.length === 0) {
    console.log(`  RESULT: 0 rows extracted`);
    return { chainName: cfg.chainName, success: false, rows: 0 };
  }

  console.log(`  RESULT: ${rows.length} rows extracted`);
  console.log(`  First 5 rows:`);
  rows.slice(0, 5).forEach((r, i) => {
    console.log(`  [${i + 1}] ${r.itemName} (${r.menuCategory})`);
    console.log(`       milk=${r.milk} eggs=${r.eggs} wheat=${r.wheat} soy=${r.soy} sesame=${r.sesame}`);
    console.log(`       fish=${r.fish} shellfish=${r.shellfish} treeNuts=${r.treeNuts} peanuts=${r.peanuts}`);
    console.log(`       confidence=${r.confidence}`);
  });

  return { chainName: cfg.chainName, success: true, rows: rows.length };
}

async function main() {
  console.log('PDF Extraction Test — 5 chains');
  console.log(new Date().toISOString());

  const results = [];
  for (const cfg of PDF_CHAINS) {
    const r = await runPDFChain(cfg);
    results.push(r);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY:');
  let successes = 0;
  for (const r of results) {
    const status = r.success ? `OK (${r.rows} rows)` : 'FAILED';
    console.log(`  ${r.chainName.padEnd(20)} ${status}`);
    if (r.success) successes++;
  }
  console.log(`\n${successes}/5 chains succeeded`);
  process.exit(successes >= 3 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
