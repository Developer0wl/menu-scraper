'use strict';

const { spawn } = require('child_process');
const path = require('path');
const BaseScraper = require('./BaseScraper');
const { logger } = require('../utils/logger');
const { makeEmptyRow, ALLERGENS } = require('../output/schema');

const SIDECAR = path.resolve(__dirname, '..', '..', 'scrape_ai.py');
const PROVIDER = process.env.AI_PROVIDER || 'groq';
const MODEL    = process.env.AI_MODEL    || 'llama-3.3-70b-versatile';
const TIMEOUT  = 180_000; // 3 min — LLM + browser render can be slow

// Resolve the Python executable.
// On Windows, pip often installs to Python312 which may not be the default 'python'.
// We resolve via LOCALAPPDATA so it works across user accounts.
// Override with AI_PYTHON env var if your setup differs.
function resolvePython() {
  if (process.env.AI_PYTHON) return process.env.AI_PYTHON;
  if (process.platform !== 'win32') return 'python3';
  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Local');
  return path.join(localAppData, 'Programs', 'Python', 'Python312', 'python.exe');
}
const PYTHON = resolvePython();

class AIScraper extends BaseScraper {
  constructor({ chainName, officialUrl }) {
    super({ chainName, officialUrl });
  }

  // No Playwright browser — Python sidecar handles HTTP/rendering
  async init() {}
  async close() {}

  async scrape() {
    logger.info('AI scrape starting', { chain: this.chainName, url: this.officialUrl, provider: PROVIDER });
    this.results = [];
    this.errors  = [];

    let rows = [];
    try {
      rows = await this._runSidecar();
    } catch (err) {
      logger.error(`AI sidecar failed: ${err.message}`, { chain: this.chainName });
    }

    if (rows.length === 0) {
      logger.warn('AI returned 0 rows — chain will show EMPTY', { chain: this.chainName });
      this._discoveredCount = 0;
      return [];
    }

    rows.forEach((row, i) => {
      row.rowNum = i + 1;
      this.validateRow(row);
    });

    this.results          = rows;
    this._discoveredCount = rows.length;
    logger.info(`AI scrape complete — ${rows.length} rows`, { chain: this.chainName });
    return rows;
  }

  _runSidecar() {
    return new Promise((resolve, reject) => {
      const args = [
        SIDECAR,
        '--chain-name', this.chainName,
        '--url',        this.officialUrl,
        '--provider',   PROVIDER,
        '--model',      MODEL,
      ];

      logger.debug(`Spawning: ${PYTHON} "${SIDECAR}"`, { chain: this.chainName });

      const proc = spawn(PYTHON, args, {
        env:     { ...process.env },
        timeout: TIMEOUT,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', d => { stdout += d.toString(); });
      proc.stderr.on('data', d => {
        stderr += d.toString();
        // Stream sidecar progress lines so they appear in the Winston log
        d.toString().split('\n').filter(Boolean).forEach(line => {
          logger.debug(`[sidecar] ${line}`, { chain: this.chainName });
        });
      });

      proc.on('error', err => {
        if (err.code === 'ENOENT') {
          reject(new Error(
            `Python not found (tried "${PYTHON}"). Install Python 3 and run: pip install -r requirements.txt`
          ));
        } else {
          reject(new Error(`spawn error: ${err.message}`));
        }
      });

      proc.on('close', code => {
        if (code !== 0) {
          return reject(new Error(
            `sidecar exited ${code}: ${stderr.slice(0, 300)}`
          ));
        }

        const raw = stdout.trim();
        if (!raw) return reject(new Error('sidecar produced no output'));

        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch (e) {
          return reject(new Error(`JSON parse failed: ${e.message} — output: ${raw.slice(0, 120)}`));
        }

        if (!Array.isArray(parsed)) {
          return reject(new Error(`Expected array, got: ${typeof parsed}`));
        }

        resolve(parsed);
      });
    });
  }
}

module.exports = AIScraper;
