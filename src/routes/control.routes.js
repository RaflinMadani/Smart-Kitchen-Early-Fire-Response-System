'use strict';
const express      = require('express');
const router       = express.Router();
const adminAuth    = require('../middlewares/adminAuth');
const deviceRepo   = require('../repositories/deviceRepo');
const controlRepo  = require('../repositories/controlRepo');
const mqttService  = require('../services/mqttService');
const { getAutoAction } = require('../services/stateEngine');
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

    // ── BUG FIX: Tolak perintah jika perangkat OFFLINE ───────────────
    if (device.status_perangkat !== 'ONLINE') {
      return res.status(409).json({
        ok: false,
        error: {
          code: 'DEVICE_OFFLINE',
          message: `Perangkat ${req.params.id} sedang OFFLINE — perintah tidak dapat dikirim`,
        },
      });
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

    // Determine sumber_kontrol
    const isManual = [fields.cmd_kipas, fields.cmd_pompa, fields.cmd_buzzer].some(v => v && v !== 'AUTO');
    fields.sumber_kontrol = isManual ? 'MANUAL_APP' : 'OTOMATIS';

    await controlRepo.updateControl(req.params.id, fields);
    const updated = await controlRepo.getControl(req.params.id);

    // ── Publish MQTT command to ESP32 ────────────────────────────────
    // Build the actual actuator output from current control row so ESP32
    // receives ON/OFF/DIAM/BERDENYUT/KONTINU — not AUTO.
    // We need the last known kode_state to resolve AUTO into action.
    // We use the device_control row directly for manual overrides.
    try {
      const mqttCmd = {
        kipas:  fields.cmd_kipas  === 'AUTO' ? undefined : (fields.cmd_kipas  === 'ON' ? 'ON' : 'OFF'),
        pompa:  fields.cmd_pompa  === 'AUTO' ? undefined : (fields.cmd_pompa  === 'ON' ? 'ON' : 'OFF'),
        buzzer: fields.cmd_buzzer === 'AUTO' ? undefined
              : fields.cmd_buzzer === 'MUTE' ? 'DIAM'
              : 'KONTINU',
        source: 'MANUAL_APP',
        ts:     Date.now(),
      };
      // Remove undefined keys
      Object.keys(mqttCmd).forEach(k => mqttCmd[k] === undefined && delete mqttCmd[k]);
      mqttService.publishCommand(req.params.id, mqttCmd);
    } catch { /* MQTT error non-fatal */ }

    res.json({ ok: true, data: updated });
  } catch (err) { next(err); }
});

module.exports = router;
