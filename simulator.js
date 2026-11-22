'use strict';
require('dotenv').config();
const mqtt = require('mqtt');

// Kredensial dibaca dari .env — jangan hardcode di sini
// Salin .env.example ke .env dan isi nilai yang sesuai
const EMQX_HOST = process.env.MQTT_URL || 'mqtts://e751b1cd.ala.asia-southeast1.emqxsl.com:8883';
const EMQX_USER = process.env.MQTT_USER || '';
const EMQX_PASS = process.env.MQTT_PASS || '';

if (!EMQX_USER || !EMQX_PASS) {
  console.error('[Simulator] MQTT_USER dan MQTT_PASS wajib diisi di file .env');
  process.exit(1);
}

console.log(`[Simulator] Menghubungkan ke EMQX Cloud (${EMQX_HOST})...`);

const client = mqtt.connect(EMQX_HOST, {
  username: EMQX_USER,
  password: EMQX_PASS,
  reconnectPeriod: 0,
  rejectUnauthorized: false,
});

client.on('connect', () => {
  console.log('[Simulator] Berhasil terhubung ke EMQX Cloud!');

  // Contoh payload data sensor (ubah nilai untuk simulasi kondisi berbeda)
  const payload = JSON.stringify({
    id_device: 'DAPUR01',
    suhu: 32.5,
    rh: 55.0,
    mq2_adc: 450,
    api: 0,
    kipas: 0,
    pompa: 0,
  });

  // Publish ke topik sensor yang didengar oleh backend
  const topic = 'smartkitchen/DAPUR01/sensor';
  client.publish(topic, payload, () => {
    console.log(`[Simulator] Data JSON berhasil dikirim ke topik: ${topic}`);
    client.end();
  });
});

client.on('error', (err) => {
  console.error('[Simulator Gagal] Koneksi ke EMQX Cloud ditolak:', err.message);
  client.end();
});
