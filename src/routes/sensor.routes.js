'use strict';
/**
 * POST /api/sensor
 *
 * Endpoint contoh yang menerima data dari ESP32 via X-API-Key,
 * memvalidasi id_device ke tabel `devices` di MySQL,
 * lalu menyimpan data sensor ke tabel `sensor_logs`.
 *
 * Flow:
 *   1. deviceAuth  — cek X-API-Key + id_device terhadap DB (SHA-256 hash)
 *   2. Zod schema  — validasi field numerik
 *   3. calcState   — hitung kode state & tingkat risiko
 *   4. Transaction — INSERT sensor_logs + UPDATE devices.terakhir_terlihat
 *   5. Response    — kembalikan state & perintah aktuator ke ESP32
 */
const express    = require('express');
const router     = express.Router();
const pool       = require('../config/db');
const deviceAuth = require('../middlewares/deviceAuth');
const { ingestSchema }                   = require('../validators/schemas');
const { calcState, getRisiko, getStatusApi } = require('../services/stateEngine');
const { applyControl }                   = require('../services/controlService');
const { handleAlert }                    = require('../services/alertService');
const sensorRepo  = require('../repositories/sensorRepo');
const controlRepo = require('../repositories/controlRepo');
const deviceRepo  = require('../repositories/deviceRepo');
const cfg         = require('../config/env');

/**
 * POST /api/sensor
 *
 * Headers wajib:
 *   Content-Type : application/json
 *   X-API-Key    : <kunci_api_device>      ← dikirim ESP32
 *
 * Body JSON:
 *   {
 *     "id_device" : "DAPUR01",   ← harus terdaftar di tabel devices
 *     "suhu"      : 41.2,
 *     "rh"        : 55.0,
 *     "mq2_adc"   : 420,
 *     "api"       : 0,
 *     "kipas"     : 0,           (opsional)
 *     "pompa"     : 0            (opsional)
 *   }
 */
router.post('/', deviceAuth, async (req, res, next) => {
  try {
    // ------------------------------------------------------------------
    // 1. Validasi skema body
    // ------------------------------------------------------------------
    const parsed = ingestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors
            .map(e => `${e.path.join('.')}: ${e.message}`)
            .join('; '),
        },
      });
    }
    const data = parsed.data;

    // ------------------------------------------------------------------
    // 2. Konfirmasi id_device cocok dengan device yang sudah di-auth
    //    (req.device diisi oleh deviceAuth setelah cek ke tabel devices)
    // ------------------------------------------------------------------
    if (req.device.id_device !== data.id_device) {
      return res.status(403).json({
        ok: false,
        error: { code: 'FORBIDDEN', message: 'id_device tidak sesuai dengan API key' },
      });
    }

    // ------------------------------------------------------------------
    // 3. Hitung state & baca perintah kontrol dari DB
    // ------------------------------------------------------------------
    const kode      = calcState(data.suhu, data.mq2_adc, data.api, cfg.ambangAsap, cfg.ambangSuhu);
    const risiko    = getRisiko(kode);
    const statusApi = getStatusApi(data.api);

    const ctrl        = await controlRepo.getControl(data.id_device);
    const defaultCtrl = { cmd_kipas: 'AUTO', cmd_pompa: 'AUTO', cmd_buzzer: 'AUTO' };
    const action      = applyControl(kode, ctrl || defaultCtrl);

    // ------------------------------------------------------------------
    // 4. Transaksi: INSERT sensor_logs + UPDATE devices + cek alert
    // ------------------------------------------------------------------
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

    // ------------------------------------------------------------------
    // 5. Kirim respons ke ESP32
    // ------------------------------------------------------------------
    return res.json({
      ok: true,
      id_log:         idLog,
      state:          kode,
      tingkat_risiko: risiko,
      kipas:          action.kipas,
      pompa:          action.pompa,
      buzzer:         action.buzzer,
      led:            action.led,
      interval:       cfg.intervalDetik,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
