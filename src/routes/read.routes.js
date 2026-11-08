'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const adminAuth = require('../middlewares/adminAuth');
const deviceRepo = require('../repositories/deviceRepo');
const sensorRepo = require('../repositories/sensorRepo');
const alertRepo  = require('../repositories/alertRepo');
const controlRepo = require('../repositories/controlRepo');

// GET /api/v1/devices/:id/status
router.get('/:id/status', adminAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM v_status_terbaru WHERE id_device = ?',
      [req.params.id]
    );
    if (!rows[0]) {
      return res.status(404).json({ ok: false, error: { code: 'DEVICE_NOT_FOUND', message: 'Device not found' } });
    }
    res.json({ ok: true, data: rows[0] });
  } catch (err) { next(err); }
});

// GET /api/v1/devices/:id/readings?from=&to=&limit=
router.get('/:id/readings', adminAuth, async (req, res, next) => {
  try {
    const device = await deviceRepo.findById(req.params.id);
    if (!device) {
      return res.status(404).json({ ok: false, error: { code: 'DEVICE_NOT_FOUND', message: 'Device not found' } });
    }
    const rows = await sensorRepo.getReadings(
      req.params.id,
      req.query.from,
      req.query.to,
      req.query.limit
    );
    res.json({ ok: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/v1/devices/:id/alerts?status=
router.get('/:id/alerts', adminAuth, async (req, res, next) => {
  try {
    const device = await deviceRepo.findById(req.params.id);
    if (!device) {
      return res.status(404).json({ ok: false, error: { code: 'DEVICE_NOT_FOUND', message: 'Device not found' } });
    }
    const rows = await alertRepo.getAlerts(req.params.id, req.query.status);
    res.json({ ok: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
