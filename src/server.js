'use strict';
require('dotenv').config();
const cfg = require('./config/env');
const app = require('./app');
const offlineWatcher = require('./jobs/offlineWatcher');
const manualRevert   = require('./jobs/manualRevert');
const logger = require('./utils/logger');

const server = app.listen(cfg.port, '0.0.0.0', () => {
  logger.info(`[server] Smart Kitchen backend listening on 0.0.0.0:${cfg.port}`);
  offlineWatcher.start();
  manualRevert.start();
});

// Graceful shutdown
function shutdown(signal) {
  logger.info(`[server] ${signal} received — shutting down`);
  server.close(() => {
    logger.info('[server] HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => { logger.error('[server] Force exit'); process.exit(1); }, 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
