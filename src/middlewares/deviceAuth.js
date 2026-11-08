'use strict';
const crypto = require('crypto');
const deviceRepo = require('../repositories/deviceRepo');

/**
 * Middleware: verify X-API-Key header against SHA-256 hash stored in DB.
 * Attaches req.device on success.
 */
async function deviceAuth(req, res, next) {
  const rawKey = req.headers['x-api-key'];
  if (!rawKey) {
    return res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Missing X-API-Key' } });
  }

  const idDevice = req.body && req.body.id_device;
  if (!idDevice) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'id_device required' } });
  }

  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const device = await deviceRepo.findByIdAndKey(idDevice, keyHash).catch(() => null);

  if (!device) {
    return res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid API key or device' } });
  }

  req.device = device;
  next();
}

module.exports = deviceAuth;
