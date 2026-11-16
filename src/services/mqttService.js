'use strict';
const mqtt   = require('mqtt');
const cfg    = require('../config/env');
const logger = require('../utils/logger');
const pool   = require('../config/db');

// ================================================================
// mqttService.js — EMQX Cloud TLS/SSL broker integration
//
// Topics (semua bertipe string JSON):
//   smartkitchen/{deviceId}/sensor     → data sensor dari ESP32  (sub)
//   smartkitchen/{deviceId}/command    → perintah ke ESP32       (pub)
//   smartkitchen/{deviceId}/status     → status aktuator dari ESP32 (sub)
// ================================================================

let client = null;
let _ready  = false;

// Lazy-require untuk menghindari circular dependency
function getIngestDeps() {
  const { ingestSchema }                               = require('../validators/schemas');
  const { calcState, getRisiko, getStatusApi }         = require('./stateEngine');
  const { applyControl }                               = require('./controlService');
  const { handleAlert }                                = require('./alertService');
  const telegramService                                = require('./telegramService');
  const sensorRepo                                     = require('../repositories/sensorRepo');
  const controlRepo                                    = require('../repositories/controlRepo');
  const deviceRepo                                     = require('../repositories/deviceRepo');
  return { ingestSchema, calcState, getRisiko, getStatusApi, applyControl,
           handleAlert, telegramService, sensorRepo, controlRepo, deviceRepo };
}

// Track per-device previous risiko to avoid duplicate Telegram alerts
const prevRisiko = {};

/** Publish a JSON payload to a topic. No-op if client not connected. */
function publish(topic, payload) {
  if (!client || !_ready) return;
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
  client.publish(topic, str, { qos: 1, retain: false }, err => {
    if (err) logger.error(`[mqtt] publish error on ${topic}: ${err.message}`);
  });
}

/**
 * Send a command to a specific device.
 * payload: { kipas, pompa, buzzer, led }  (values: 'ON'|'OFF'|'DIAM'|'BERDENYUT'|'KONTINU'|'HIJAU'|'MERAH_KEDIP'|'MERAH_TETAP')
 */
function publishCommand(deviceId, payload) {
  publish(`smartkitchen/${deviceId}/command`, payload);
}

/**
 * Publish current sensor state to dashboard WebSocket/MQTT clients.
 * Used after ingest so the web dashboard can subscribe directly.
 */
function publishSensorState(deviceId, payload) {
  publish(`smartkitchen/${deviceId}/sensor`, payload);
}

/** Returns true when broker is connected */
function isReady() { return _ready; }

// ================================================================
// _handleSensorMessage() — proses data sensor dari ESP32 via MQTT
// Logika identik dengan POST /api/v1/ingest
// ================================================================
async function _handleSensorMessage(deviceId, payload) {
  const { ingestSchema, calcState, getRisiko, getStatusApi, applyControl,
          handleAlert, telegramService, sensorRepo, controlRepo, deviceRepo } = getIngestDeps();

  // 1. Validate
  const parsed = ingestSchema.safeParse(payload);
  if (!parsed.success) {
    logger.warn(`[mqtt] sensor payload invalid dari ${deviceId}: ${parsed.error.errors.map(e => e.message).join('; ')}`);
    return;
  }
  const data = parsed.data;

  // 2. Calculate state
  const kode      = calcState(data.suhu, data.mq2_adc, data.api, cfg.ambangAsap, cfg.ambangSuhu);
  const risiko    = getRisiko(kode);
  const statusApi = getStatusApi(data.api);

  // 3. Read device_control
  const ctrl        = await controlRepo.getControl(data.id_device);
  const defaultCtrl = { cmd_kipas: 'AUTO', cmd_pompa: 'AUTO', cmd_buzzer: 'AUTO' };
  const action      = applyControl(kode, ctrl || defaultCtrl);

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
      rh:            data.rh   ?? null,
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
    logger.error(`[mqtt] ingest DB error (${data.id_device}): ${err.message}`);
    return;
  } finally {
    conn.release();
  }

  // 5. Telegram alert — kirim hanya saat transisi ke/dari BAHAYA
  const device = await deviceRepo.findById(data.id_device);
  const lokasi = device ? device.lokasi : data.id_device;
  const prevR  = prevRisiko[data.id_device];
  if (risiko === 'BAHAYA' && prevR !== 'BAHAYA') {
    telegramService.notifyBahaya(data.id_device, lokasi, kode, risiko, {
      suhu: data.suhu, mq2Adc: data.mq2_adc, statusApi,
    });
  } else if (risiko === 'AMAN' && prevR === 'BAHAYA') {
    telegramService.notifyAman(data.id_device, lokasi);
  }
  prevRisiko[data.id_device] = risiko;

  // 6. Publish command balik ke ESP32 (agar aktuator mengikuti state terbaru)
  publishCommand(data.id_device, {
    state:  kode,
    kipas:  action.kipas,
    pompa:  action.pompa,
    buzzer: action.buzzer,
    led:    action.led,
    ts:     Date.now(),
  });

  logger.info(`[mqtt] ← sensor ${data.id_device} state=${kode} (${risiko}) kipas=${action.kipas} pompa=${action.pompa}`);
}

/** Start MQTT connection. Called from server.js once at boot. */
function start() {
  if (!cfg.mqttUrl) {
    logger.warn('[mqtt] MQTT_URL not set — MQTT disabled');
    return;
  }

  const options = {
    clientId:  `smart-kitchen-server-${process.pid}`,
    username:  cfg.mqttUser,
    password:  cfg.mqttPass,
    // TLS: trust the EMQX root CA; set rejectUnauthorized:true for production
    rejectUnauthorized: false,
    keepalive:          30,
    reconnectPeriod:    5000,
    connectTimeout:     10000,
    clean:              true,
    will: {
      topic:   'smartkitchen/server/status',
      payload: JSON.stringify({ online: false, ts: Date.now() }),
      qos:     1,
      retain:  true,
    },
  };

  logger.info(`[mqtt] Connecting to ${cfg.mqttUrl} …`);
  client = mqtt.connect(cfg.mqttUrl, options);

  client.on('connect', () => {
    _ready = true;
    logger.info('[mqtt] Connected to EMQX broker');

    // Subscribe ke data sensor dari semua device
    client.subscribe('smartkitchen/+/sensor', { qos: 1 }, (err) => {
      if (err) logger.error('[mqtt] subscribe error: ' + err.message);
      else     logger.info('[mqtt] Subscribed to smartkitchen/+/sensor');
    });

    // Publish birth message
    client.publish('smartkitchen/server/status',
      JSON.stringify({ online: true, ts: Date.now() }),
      { qos: 1, retain: true });
  });

  client.on('reconnect', () => {
    _ready = false;
    logger.warn('[mqtt] Reconnecting…');
  });

  client.on('offline', () => {
    _ready = false;
    logger.warn('[mqtt] Broker offline');
  });

  client.on('error', err => {
    _ready = false;
    logger.error('[mqtt] Error: ' + err.message);
  });

  client.on('message', (topic, message) => {
    // smartkitchen/{deviceId}/sensor
    const sensorMatch = topic.match(/^smartkitchen\/([^/]+)\/sensor$/);
    if (sensorMatch) {
      let payload;
      try {
        payload = JSON.parse(message.toString());
      } catch {
        logger.warn(`[mqtt] Non-JSON sensor message dari ${topic}`);
        return;
      }
      _handleSensorMessage(sensorMatch[1], payload).catch(err => {
        logger.error(`[mqtt] _handleSensorMessage error: ${err.message}`);
      });
    }
  });
}

/** Graceful shutdown */
function stop() {
  if (client) {
    client.publish('smartkitchen/server/status',
      JSON.stringify({ online: false, ts: Date.now() }),
      { qos: 1, retain: true }, () => client.end());
  }
}

module.exports = { start, stop, publish, publishCommand, publishSensorState, isReady };
