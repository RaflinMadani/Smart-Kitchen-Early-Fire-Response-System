'use strict';
const mqtt   = require('mqtt');
const cfg    = require('../config/env');
const logger = require('../utils/logger');

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
    try {
      const payload = JSON.parse(message.toString());
      logger.info(`[mqtt] ← ${topic}: ${JSON.stringify(payload)}`);
    } catch {
      logger.warn(`[mqtt] Non-JSON message on ${topic}`);
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
