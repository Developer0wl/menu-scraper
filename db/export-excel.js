'use strict';

/**
 * Allerva Checkpoint → Excel Exporter
 *
 * Reads all checkpoint JSONs and writes a formatted Excel workbook
 * WITHOUT running any scrapers or browsers. Safe to run any time.
 *
 *   node db/export-excel.js
 *
 * Output: output/allerva-export-YYYYMMDD.xlsx
 */

const path        = require('path');
const fs          = require('fs');
const ExcelWriter = require('../src/output/ExcelWriter');
const checkpoint  = require('../src/checkpoint');
const { RESTAURANTS } = require('./restaurants_seed');

// Map chain_status → ExcelWriter status string
const STATUS_MAP = {
  DONE_LIVE:  'OK',
  DONE_AI:    'OK',
  DONE_PDF:   'OK',
  DONE_CNV:   'PARTIAL',
  DATA_ISSUE: 'PARTIAL',
  BLOCKED:    'ACCESS_BLOCKED',
};

async function main() {
  const outputDir = path.resolve(__dirname, '..', 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const datestamp  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outputFile = path.join(outputDir, `allerva-export-${datestamp}.xlsx`);

  const writer = new ExcelWriter(outputFile);

  let totalChains = 0;
  let totalItems  = 0;

  for (const meta of RESTAURANTS) {
    const { cli_key, display_name, status } = meta;
    const excelStatus = STATUS_MAP[status] ?? 'ACCESS_BLOCKED';

    const data = checkpoint.load(cli_key);
    const rows = data?.rows ?? [];

    // Always add a sheet so every chain appears in the workbook
    // Use display_name (truncated to 31 chars — Excel tab limit) as sheet name
    const sheetName = display_name.slice(0, 31);
    writer.addChainSheet(sheetName, rows, excelStatus);

    totalItems += rows.length;
    totalChains++;

    const label = rows.length > 0 ? `${rows.length} items` : 'no data';
    console.log(`  [${cli_key}] ${display_name}: ${label} (${excelStatus})`);
  }

  writer.addSummarySheet();
  await writer.save();

  console.log(`\nExport complete:`);
  console.log(`  Chains: ${totalChains}`);
  console.log(`  Items:  ${totalItems}`);
  console.log(`  File:   ${outputFile}`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
