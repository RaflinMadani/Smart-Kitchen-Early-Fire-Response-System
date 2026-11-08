'use strict';
const cfg = require('../config/env');

/**
 * Middleware: verify Authorization: Bearer <ADMIN_TOKEN>.
 */
function adminAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token || token !== cfg.adminToken) {
    return res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid admin token' } });
  }
  next();
}

module.exports = adminAuth;
