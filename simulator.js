'use strict';
require('dotenv').config();
const mqtt = require('mqtt');

// Ganti dengan detail dari Dashboard EMQX Cloud kamu
const EMQX_HOST = 'mqtts://e751b1cd.ala.asia-southeast1.emqxsl.com:8883'; // Ubah sesuai URL broker EMQX kamu
const EMQX_PORT = 8883; // Gunakan 8883 jika pakai SSL/TLS (mqtts://)
const EMQX_USER = 'smart_kitchen_esp32';
const EMQX_PASS = 'Smart*2026';

const brokerUrl = `mqtt://${EMQX_HOST}:${EMQX_PORT}`;

console.log(`[Simulator] Menghubungkan ke EMQX Cloud (${EMQX_HOST})...`);

const client = mqtt.connect(brokerUrl, {
  username: EMQX_USER,
  password: EMQX_PASS,
  reconnectPeriod: 0
});

client.on('connect', () => {
  console.log('[Simulator] Berhasil terhubung ke EMQX Cloud!');

  // Contoh Payload Data Sensor (Kondisi AMAN atau BAHAYA)
  const payload = JSON.stringify({
    id_device: "DAPUR01",
    suhu_celcius: 32.5,
    kelembapan_rh: 55.0,
    mq2_adc: 450,
    status_api: "TIDAK_ADA",
    tingkat_risiko: "AMAN", // Ubah ke "BAHAYA" jika ingin tes trigger Telegram
    status_kipas: "OFF",
    status_pompa: "OFF",
    status_buzzer: "DIAM",
    sumber_kontrol: "OTOMATIS"
  });

  // Kirim ke topik MQTT yang didengar oleh backend kamu
  client.publish('smart-kitchen/telemetry', payload, () => {
    console.log('[Simulator] Data JSON berhasil dikirim ke EMQX Cloud!');
    client.end();
  });
});

client.on('error', (err) => {
  console.error('[Simulator Gagal] Koneksi ke EMQX Cloud ditolak:', err.message);
  client.end();
});