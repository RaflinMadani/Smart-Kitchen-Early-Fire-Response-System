'use strict';
const cfg = require('../config/env');

/**
 * Middleware: verify admin token from either:
 *   - Authorization: Bearer <ADMIN_TOKEN>
 *   - X-API-Key: <ADMIN_TOKEN>
 */
function adminAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const apiKeyToken = req.headers['x-api-key'] || null;

  const token = bearerToken || apiKeyToken;

  if (!token || token !== cfg.adminToken) {
    return res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid admin token' } });
  }
  next();
}

module.exports = adminAuth;
