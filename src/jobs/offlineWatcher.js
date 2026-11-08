'use strict';
const cron = require('node-cron');
const deviceRepo = require('../repositories/deviceRepo');
const cfg = require('../config/env');
const logger = require('../utils/logger');

/**
 * Mark devices as OFFLINE when terakhir_terlihat is older than
 * (INTERVAL_DETIK * OFFLINE_FAKTOR) seconds.
 */
function start() {
  const threshold = cfg.intervalDetik * cfg.offlineFaktor;
  // Every 5 seconds
  setInterval(async () => {
    try {
      await deviceRepo.markOfflineStale(threshold);
    } catch (err) {
      logger.error('[offlineWatcher] ' + err.message);
    }
  }, cfg.intervalDetik * 1000);

  logger.info(`[offlineWatcher] started (threshold=${threshold}s)`);
}

module.exports = { start };
