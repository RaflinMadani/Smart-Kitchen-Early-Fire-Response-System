'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const deviceAuth = require('../middlewares/deviceAuth');
const { ingestSchema } = require('../validators/schemas');
const { calcState, getRisiko, getStatusApi } = require('../services/stateEngine');
const { applyControl } = require('../services/controlService');
const { handleAlert } = require('../services/alertService');
const sensorRepo = require('../repositories/sensorRepo');
const controlRepo = require('../repositories/controlRepo');
const deviceRepo = require('../repositories/deviceRepo');
const cfg = require('../config/env');

router.post('/', deviceAuth, async (req, res, next) => {
  try {
    // 1. Validate
    const parsed = ingestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; '),
        },
      });
    }
    const data = parsed.data;

    // 2. Calculate state
    const kode    = calcState(data.suhu, data.mq2_adc, data.api, cfg.ambangAsap, cfg.ambangSuhu);
    const risiko  = getRisiko(kode);
    const statusApi = getStatusApi(data.api);

    // 3. Read device_control
    const ctrl = await controlRepo.getControl(data.id_device);
    const defaultCtrl = { cmd_kipas: 'AUTO', cmd_pompa: 'AUTO', cmd_buzzer: 'AUTO' };
    const action = applyControl(kode, ctrl || defaultCtrl);

    // 4. Transaction: insert sensor_log, update device, handle alert
    const conn = await pool.getConnection();
    let idLog;
    try {
      await conn.beginTransaction();

      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

      idLog = await sensorRepo.insert(conn, {
        idDevice:      data.id_device,
        waktuRekam:    now,
        suhu:          data.suhu ?? null,
        rh:            data.rh ?? null,
        mq2Adc:        data.mq2_adc,
        statusApi,
        kodeState:     kode,
        tingkatRisiko: risiko,
        statusKipas:   action.kipas,
        statusPompa:   action.pompa,
        statusBuzzer:  action.buzzer,
        sumberKontrol: action.sumber,
      });

      await deviceRepo.setOnline(conn, data.id_device);
      await handleAlert(conn, data.id_device, kode, risiko, idLog);

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    // 5. Respond
    return res.json({
      ok: true,
      state: kode,
      tingkat_risiko: risiko,
      kipas:  action.kipas,
      pompa:  action.pompa,
      buzzer: action.buzzer,
      led:    action.led,
      interval: cfg.intervalDetik,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
