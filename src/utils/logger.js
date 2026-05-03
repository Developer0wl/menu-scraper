'use strict';

const path = require('path');
const fs = require('fs');
const { createLogger, format, transports } = require('winston');

const logsDir = path.resolve(__dirname, '..', '..', 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// Main run logger
const logger = createLogger({
  level: 'debug',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.Console({
      level: 'info',
      format: format.combine(
        format.colorize(),
        format.timestamp({ format: 'HH:mm:ss' }),
        format.printf(({ level, message, timestamp: ts, chain, item, allergen, value }) => {
          let line = `${ts} [${level}]`;
          if (chain) line += ` [${chain}]`;
          if (item)  line += ` [${item}]`;
          if (allergen) line += ` ${allergen}=${value}`;
          line += ` ${message}`;
          return line;
        })
      ),
    }),
    new transports.File({
      filename: path.join(logsDir, `run-${timestamp}.log`),
      level: 'debug',
    }),
  ],
});

// Separate validation logger
const validationLogger = createLogger({
  level: 'debug',
  format: format.combine(format.timestamp(), format.json()),
  transports: [
    new transports.File({
      filename: path.join(logsDir, 'validation.log'),
    }),
    new transports.Console({
      level: 'warn',
      format: format.combine(
        format.colorize(),
        format.printf(({ level, message }) => `[VALIDATION] [${level}] ${message}`)
      ),
    }),
  ],
});

module.exports = { logger, validationLogger };
