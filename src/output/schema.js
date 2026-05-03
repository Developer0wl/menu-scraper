'use strict';

const ALLERGENS = ['milk', 'eggs', 'fish', 'shellfish', 'treeNuts', 'peanuts', 'wheat', 'soy', 'sesame'];

const VALID_VALUES = new Set(['TRUE', 'FALSE', 'COULD_NOT_VERIFY']);
const VALID_CONFIDENCE = new Set(['HIGH', 'LOW', 'COULD_NOT_VERIFY']);

// Columns A–Q for every chain sheet
const COLUMNS = [
  { key: 'rowNum',       header: '#',              col: 'A', width: 6  },
  { key: 'menuCategory', header: 'Menu Category',   col: 'B', width: 22 },
  { key: 'itemName',     header: 'Item Name',       col: 'C', width: 38 },
  { key: 'milk',         header: 'Milk',            col: 'D', width: 12 },
  { key: 'eggs',         header: 'Eggs',            col: 'E', width: 12 },
  { key: 'fish',         header: 'Fish',            col: 'F', width: 12 },
  { key: 'shellfish',    header: 'Shellfish',       col: 'G', width: 12 },
  { key: 'treeNuts',     header: 'Tree Nuts',       col: 'H', width: 12 },
  { key: 'peanuts',      header: 'Peanuts',         col: 'I', width: 12 },
  { key: 'wheat',        header: 'Wheat',           col: 'J', width: 12 },
  { key: 'soy',          header: 'Soy',             col: 'K', width: 12 },
  { key: 'sesame',       header: 'Sesame',          col: 'L', width: 12 },
  { key: 'crossContact', header: 'Cross Contact',   col: 'M', width: 16 },
  { key: 'sourceUrl',    header: 'Source URL',      col: 'N', width: 45 },
  { key: 'scrapeDate',   header: 'Scrape Date',     col: 'O', width: 24 },
  { key: 'confidence',   header: 'Confidence',      col: 'P', width: 14 },
  { key: 'sourceText',   header: 'Source Text',     col: 'Q', width: 65 },
];

// ExcelJS ARGB colours (alpha byte first)
const CELL_STYLES = {
  TRUE: {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } },
    font: { color: { argb: 'FF065F46' }, bold: true },
  },
  FALSE: {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } },
    font: { color: { argb: 'FF6B7280' }, bold: false },
  },
  COULD_NOT_VERIFY: {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9EC' } },
    font: { color: { argb: 'FFB45309' }, bold: true },
  },
  HEADER: {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } },
    font: { color: { argb: 'FFFFFFFF' }, bold: true },
  },
  ROW_ALT: {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } },
  },
  ROW_NORMAL: {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } },
  },
};

const LOW_CONFIDENCE_SUFFIX = '*';

// Allergen keyword map — case-insensitive substring matching
const ALLERGEN_KEYWORDS = {
  milk:      ['milk', 'dairy', 'butter', 'cream', 'cheese', 'lactose', 'whey', 'casein'],
  eggs:      ['egg', 'eggs'],
  fish:      ['fish', 'anchov', 'cod', 'salmon', 'tilapia', 'tuna', 'pollock', 'catfish'],
  shellfish: ['shellfish', 'shrimp', 'crab', 'lobster', 'clam', 'oyster', 'scallop', 'crustacean'],
  treeNuts:  ['tree nut', 'almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'hazelnut', 'macadamia', 'brazil nut', 'pine nut'],
  peanuts:   ['peanut'],
  wheat:     ['wheat', 'gluten', 'flour', 'barley', 'rye', 'spelt', 'triticale'],
  soy:       ['soy', 'soya', 'soybean', 'tofu', 'edamame', 'miso', 'tempeh'],
  sesame:    ['sesame', 'tahini'],
};

function makeEmptyRow() {
  const row = {
    rowNum: 0,
    menuCategory: 'COULD_NOT_VERIFY',
    itemName: 'COULD_NOT_VERIFY',
    crossContact: 'COULD_NOT_VERIFY',
    sourceUrl: 'COULD_NOT_VERIFY',
    scrapeDate: new Date().toISOString(),
    confidence: 'COULD_NOT_VERIFY',
    sourceText: '',
  };
  for (const allergen of ALLERGENS) {
    row[allergen] = 'COULD_NOT_VERIFY';
  }
  return row;
}

module.exports = {
  ALLERGENS,
  COLUMNS,
  CELL_STYLES,
  LOW_CONFIDENCE_SUFFIX,
  ALLERGEN_KEYWORDS,
  VALID_VALUES,
  VALID_CONFIDENCE,
  makeEmptyRow,
};
