'use strict';
require('dotenv').config();

const REQUIRED = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASS', 'DB_NAME', 'ADMIN_TOKEN'];
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`[config/env] Missing required env var: ${key}`);
    process.exit(1);
  }
}

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  db: {
    host:               process.env.DB_HOST,
    port:               parseInt(process.env.DB_PORT || '3306', 10),
    user:               process.env.DB_USER,
    password:           process.env.DB_PASS,
    database:           process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit:    10,
    dateStrings:        true,
    timezone:           '+07:00',
  },
  adminToken: process.env.ADMIN_TOKEN,

  // Sensor thresholds
  ambangAsap:  parseInt(process.env.AMBANG_ASAP || '1000', 10),
  ambangSuhu:  parseFloat(process.env.AMBANG_SUHU || '40'),

  // Timing
  intervalDetik:      parseInt(process.env.INTERVAL_DETIK || '5', 10),
  offlineFaktor:      parseInt(process.env.OFFLINE_FAKTOR || '3', 10),
  manualRevertDetik:  parseInt(process.env.MANUAL_REVERT_DETIK || '60', 10),
  pompaManuaMaxDetik: parseInt(process.env.POMPA_MANUAL_MAX_DETIK || '10', 10),

  // MQTT EMQX Cloud
  mqttUrl:  process.env.MQTT_URL  || '',
  mqttUser: process.env.MQTT_USER || '',
  mqttPass: process.env.MQTT_PASS || '',

  // Telegram
  telegramEnabled: (process.env.TELEGRAM_ENABLED || 'true') === 'true',
  telegramToken:   process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId:  process.env.TELEGRAM_CHAT_ID   || '',
};
