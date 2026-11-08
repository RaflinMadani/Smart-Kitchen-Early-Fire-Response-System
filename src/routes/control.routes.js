'use strict';
const express = require('express');
const router = express.Router();
const adminAuth = require('../middlewares/adminAuth');
const deviceRepo = require('../repositories/deviceRepo');
const controlRepo = require('../repositories/controlRepo');
const { controlSchema } = require('../validators/schemas');

// GET /api/v1/devices/:id/control
router.get('/:id/control', adminAuth, async (req, res, next) => {
  try {
    const device = await deviceRepo.findById(req.params.id);
    if (!device) {
      return res.status(404).json({ ok: false, error: { code: 'DEVICE_NOT_FOUND', message: 'Device not found' } });
    }
    const ctrl = await controlRepo.getControl(req.params.id);
    res.json({ ok: true, data: ctrl });
  } catch (err) { next(err); }
});

// PUT /api/v1/devices/:id/control
router.put('/:id/control', adminAuth, async (req, res, next) => {
  try {
    const device = await deviceRepo.findById(req.params.id);
    if (!device) {
      return res.status(404).json({ ok: false, error: { code: 'DEVICE_NOT_FOUND', message: 'Device not found' } });
    }

    const parsed = controlSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; '),
        },
      });
    }

    const { kipas, pompa, buzzer } = parsed.data;
    const fields = {};
    if (kipas  !== undefined) fields.cmd_kipas  = kipas;
    if (pompa  !== undefined) fields.cmd_pompa  = pompa;
    if (buzzer !== undefined) fields.cmd_buzzer = buzzer;

    // Determine sumber_kontrol: if any cmd is not AUTO, it's manual
    const isManual = [fields.cmd_kipas, fields.cmd_pompa, fields.cmd_buzzer].some(v => v && v !== 'AUTO');
    fields.sumber_kontrol = isManual ? 'MANUAL_APP' : 'OTOMATIS';

    await controlRepo.updateControl(req.params.id, fields);
    const updated = await controlRepo.getControl(req.params.id);
    res.json({ ok: true, data: updated });
  } catch (err) { next(err); }
});

module.exports = router;
