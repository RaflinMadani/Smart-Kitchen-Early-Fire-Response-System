'use strict';
const https   = require('https');
const cfg     = require('../config/env');
const logger  = require('../utils/logger');

// ================================================================
// telegramService.js — Kirim notifikasi ke Telegram Bot
//
// Konfigurasi .env:
//   TELEGRAM_BOT_TOKEN=123456789:ABC-xxx
//   TELEGRAM_CHAT_ID=-100xxxxxxxxxx        (grup / channel / pribadi)
//   TELEGRAM_ENABLED=true                  (opsional, default true)
// ================================================================

/** Kirim pesan teks Markdown ke Telegram.  Fire-and-forget — tidak memblokir. */
function sendAlert(text) {
  if (!cfg.telegramEnabled) return;
  if (!cfg.telegramToken || !cfg.telegramChatId) {
    logger.warn('[telegram] Token/ChatId tidak diatur — notifikasi dilewati');
    return;
  }

  const body = JSON.stringify({
    chat_id:    cfg.telegramChatId,
    text,
    parse_mode: 'Markdown',
  });

  const options = {
    hostname: 'api.telegram.org',
    path:     `/bot${cfg.telegramToken}/sendMessage`,
    method:   'POST',
    headers: {
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  const req = https.request(options, res => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
      if (res.statusCode !== 200) {
        logger.warn(`[telegram] HTTP ${res.statusCode}: ${data}`);
      }
    });
  });

  req.on('error', err => logger.error('[telegram] ' + err.message));
  req.write(body);
  req.end();
}

// ── Pesan terformat per tingkat kondisi ──────────────────────────

/**
 * Kirim notifikasi bahaya ke Telegram.
 * @param {string} deviceId
 * @param {string} lokasi
 * @param {number} kode        kode_state 5-8
 * @param {string} risiko      'BAHAYA'
 * @param {object} sensor      { suhu, mq2Adc, statusApi }
 */
function notifyBahaya(deviceId, lokasi, kode, risiko, sensor) {
  const icon = kode === 8 ? '🔥🔥🔥' : '🔥';
  const waktu = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta', hour12: false,
  });

  const lines = [
    `${icon} *PERINGATAN BAHAYA — Smart Kitchen*`,
    ``,
    `📍 Lokasi : ${lokasi}`,
    `🔑 Device : \`${deviceId}\``,
    `⚠️ State  : *${kode}* (${risiko})`,
    `🕐 Waktu  : ${waktu}`,
    ``,
    `📊 *Data Sensor:*`,
    `• Suhu    : ${sensor.suhu != null ? sensor.suhu.toFixed(1) + ' °C' : '—'}`,
    `• Gas MQ-2: ${sensor.mq2Adc != null ? sensor.mq2Adc + ' ADC' : '—'}`,
    `• Api     : ${sensor.statusApi === 'TERDETEKSI' ? '🔥 TERDETEKSI' : '✅ Tidak ada'}`,
    ``,
    `🚨 *Pompa air diaktifkan — Segera periksa lokasi!*`,
  ];

  sendAlert(lines.join('\n'));
}

/**
 * Kirim notifikasi kondisi kembali aman.
 */
function notifyAman(deviceId, lokasi) {
  const waktu = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta', hour12: false,
  });
  sendAlert([
    `✅ *Kondisi AMAN — Smart Kitchen*`,
    `📍 Lokasi : ${lokasi}`,
    `🔑 Device : \`${deviceId}\``,
    `🕐 Waktu  : ${waktu}`,
    `Situasi telah kembali normal.`,
  ].join('\n'));
}

module.exports = { sendAlert, notifyBahaya, notifyAman };
