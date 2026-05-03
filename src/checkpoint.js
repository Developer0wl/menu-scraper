'use strict';

const path = require('path');
const fs = require('fs');

const checkpointsDir = path.resolve(__dirname, '..', 'checkpoints');
if (!fs.existsSync(checkpointsDir)) fs.mkdirSync(checkpointsDir, { recursive: true });

function checkpointPath(chainName) {
  return path.join(checkpointsDir, `${chainName}.json`);
}

function save(chainName, rows) {
  const data = {
    chainName,
    savedAt: new Date().toISOString(),
    rowCount: rows.length,
    rows,
  };
  fs.writeFileSync(checkpointPath(chainName), JSON.stringify(data, null, 2), 'utf8');
}

function load(chainName) {
  const p = checkpointPath(chainName);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function listCompleted() {
  if (!fs.existsSync(checkpointsDir)) return [];
  return fs.readdirSync(checkpointsDir)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}

function remove(chainName) {
  const p = checkpointPath(chainName);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

module.exports = { save, load, listCompleted, remove };
