'use strict';

const path = require('path');
const ExcelJS = require('exceljs');
const { COLUMNS, CELL_STYLES, ALLERGENS, LOW_CONFIDENCE_SUFFIX } = require('./schema');

const ALLERGEN_COLS = new Set(['milk', 'eggs', 'fish', 'shellfish', 'treeNuts', 'peanuts', 'wheat', 'soy', 'sesame', 'crossContact']);

class ExcelWriter {
  constructor(outputPath) {
    this.outputPath = outputPath;
    this.workbook   = new ExcelJS.Workbook();
    this.workbook.creator = 'Allerva Scraper';
    this.workbook.created = new Date();
    this._chainSummaries = [];
    // Pre-create summary sheet so it is always sheet 1 (ExcelJS has no moveSheet API)
    this._summarySheet = this.workbook.addWorksheet('Verification Summary');
  }

  /**
   * Add one sheet for a chain.
   * rows: Array of row objects matching schema.js COLUMNS keys.
   * status: 'OK' | 'PARTIAL' | 'ACCESS_BLOCKED' | 'TIMEOUT' | 'ERROR'
   */
  addChainSheet(chainName, rows, status = 'OK') {
    const sheet = this.workbook.addWorksheet(chainName.slice(0, 31), {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    // Set column widths
    sheet.columns = COLUMNS.map(c => ({ key: c.key, width: c.width, header: c.header }));

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.eachCell(cell => {
      cell.fill = CELL_STYLES.HEADER.fill;
      cell.font = { ...CELL_STYLES.HEADER.font, name: 'Calibri', size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FF9CA3AF' } },
      };
    });
    headerRow.height = 20;

    // Data rows
    rows.forEach((rowData, idx) => {
      const rowNum  = idx + 2; // 1-indexed, header is row 1
      const isAlt   = idx % 2 === 1;
      const exRow   = sheet.getRow(rowNum);

      COLUMNS.forEach(col => {
        const cell  = exRow.getCell(col.col);
        let rawVal  = rowData[col.key];
        if (rawVal === null || rawVal === undefined) rawVal = 'COULD_NOT_VERIFY';

        const isAllergenCol = ALLERGEN_COLS.has(col.key);

        if (isAllergenCol) {
          const isLow = rowData.confidence === 'LOW';
          const displayVal = isLow ? `${rawVal}${LOW_CONFIDENCE_SUFFIX}` : String(rawVal);
          cell.value = displayVal;

          const styleKey = ['TRUE', 'FALSE', 'COULD_NOT_VERIFY'].includes(rawVal) ? rawVal : 'COULD_NOT_VERIFY';
          const style    = CELL_STYLES[styleKey];
          cell.fill = style.fill;
          cell.font = { ...style.font, name: 'Calibri', size: 10 };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.value = rawVal !== undefined && rawVal !== null ? String(rawVal) : '';
          cell.fill  = isAlt ? CELL_STYLES.ROW_ALT.fill : CELL_STYLES.ROW_NORMAL.fill;
          cell.font  = { name: 'Calibri', size: 10 };
          cell.alignment = { vertical: 'middle', wrapText: col.key === 'sourceText' };
        }
      });

      exRow.height = 16;
    });

    // Auto-filter on header row
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to:   { row: 1, column: COLUMNS.length },
    };

    // Tally for summary sheet
    let trueCount = 0, falseCount = 0, cnvCount = 0;
    rows.forEach(r => {
      for (const a of ALLERGENS) {
        if (r[a] === 'TRUE')               trueCount++;
        else if (r[a] === 'FALSE')          falseCount++;
        else                                cnvCount++;
      }
    });

    this._chainSummaries.push({
      chain:          chainName,
      itemsDiscovered: rows.length,
      itemsExtracted:  rows.length,
      trueCount,
      falseCount,
      cnvCount,
      status,
      scrapeDate:     new Date().toISOString(),
    });
  }

  /**
   * Add a "Verification Summary" sheet as the first sheet.
   * Must be called AFTER all chain sheets are added.
   */
  addSummarySheet() {
    const sheet = this._summarySheet; // already at position 0 (pre-created in constructor)

    const headers = ['Chain', 'Items Discovered', 'Items Extracted',
                     'TRUE Count', 'FALSE Count', 'CNV Count', 'Status', 'Scrape Date'];
    sheet.columns = headers.map((h, i) => ({
      header: h,
      key: String(i),
      width: [20, 18, 16, 12, 12, 12, 18, 26][i],
    }));

    const headerRow = sheet.getRow(1);
    headerRow.eachCell(cell => {
      cell.fill = CELL_STYLES.HEADER.fill;
      cell.font = { ...CELL_STYLES.HEADER.font, name: 'Calibri', size: 11 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    headerRow.height = 20;

    this._chainSummaries.forEach((s, idx) => {
      const r = sheet.addRow([
        s.chain, s.itemsDiscovered, s.itemsExtracted,
        s.trueCount, s.falseCount, s.cnvCount,
        s.status, s.scrapeDate,
      ]);
      const isAlt = idx % 2 === 1;
      r.eachCell(cell => {
        cell.fill = isAlt ? CELL_STYLES.ROW_ALT.fill : CELL_STYLES.ROW_NORMAL.fill;
        cell.font = { name: 'Calibri', size: 10 };
        cell.alignment = { vertical: 'middle' };
      });

      // Colour the Status cell
      const statusCell = r.getCell(7);
      if (s.status === 'OK') {
        statusCell.fill = CELL_STYLES.TRUE.fill;
        statusCell.font = { ...CELL_STYLES.TRUE.font, name: 'Calibri', size: 10 };
      } else if (s.status === 'PARTIAL') {
        statusCell.fill = CELL_STYLES.COULD_NOT_VERIFY.fill;
        statusCell.font = { ...CELL_STYLES.COULD_NOT_VERIFY.font, name: 'Calibri', size: 10 };
      } else {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        statusCell.font = { color: { argb: 'FF991B1B' }, bold: true, name: 'Calibri', size: 10 };
      }

      r.height = 16;
    });

    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  }

  async save() {
    await this.workbook.xlsx.writeFile(this.outputPath);
    return this.outputPath;
  }
}

module.exports = ExcelWriter;
