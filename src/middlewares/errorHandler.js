'use strict';
const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  logger.error('[errorHandler] ' + (err.stack || err.message));
  res.status(500).json({
    ok: false,
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
}

module.exports = errorHandler;
