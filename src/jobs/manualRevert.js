'use strict';
const controlRepo = require('../repositories/controlRepo');
const cfg = require('../config/env');
const logger = require('../utils/logger');

/**
 * Two revert jobs:
 * 1. Pump manual ON → AUTO after POMPA_MANUAL_MAX_DETIK seconds
 * 2. All manual commands → AUTO after MANUAL_REVERT_DETIK seconds
 */
function start() {
  setInterval(async () => {
    try {
      await controlRepo.revertPompaManual(cfg.pompaManuaMaxDetik);
      await controlRepo.revertAllManual(cfg.manualRevertDetik);
    } catch (err) {
      logger.error('[manualRevert] ' + err.message);
    }
  }, cfg.intervalDetik * 1000);

  logger.info('[manualRevert] started');
}

module.exports = { start };
