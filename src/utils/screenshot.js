'use strict';

const path = require('path');
const fs = require('fs');

const screenshotsRoot = path.resolve(__dirname, '..', '..', 'screenshots');

async function saveScreenshot(page, chainName, label) {
  const chainDir = path.join(screenshotsRoot, chainName);
  if (!fs.existsSync(chainDir)) fs.mkdirSync(chainDir, { recursive: true });

  const safeName = label.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  const filename = `${safeName}-${Date.now()}.png`;
  const filepath = path.join(chainDir, filename);

  try {
    await page.screenshot({ path: filepath, fullPage: true });
    return filepath;
  } catch {
    // fullPage can fail on heavy SPAs — fall back to viewport only
    try {
      await page.screenshot({ path: filepath, fullPage: false });
      return filepath;
    } catch {
      return null;
    }
  }
}

module.exports = { saveScreenshot };
