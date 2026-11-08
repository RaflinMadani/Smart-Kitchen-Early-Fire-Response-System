'use strict';
const pool = require('../config/db');

async function findByIdAndKey(idDevice, keyHash) {
  const [rows] = await pool.execute(
    'SELECT id_device, lokasi, status_perangkat FROM devices WHERE id_device = ? AND api_key_hash = ?',
    [idDevice, keyHash]
  );
  return rows[0] || null;
}

async function findById(idDevice) {
  const [rows] = await pool.execute(
    'SELECT id_device, lokasi, status_perangkat FROM devices WHERE id_device = ?',
    [idDevice]
  );
  return rows[0] || null;
}

async function setOnline(conn, idDevice) {
  await conn.execute(
    `UPDATE devices SET status_perangkat = 'ONLINE', terakhir_terlihat = NOW() WHERE id_device = ?`,
    [idDevice]
  );
}

async function markOfflineStale(thresholdSeconds) {
  await pool.execute(
    `UPDATE devices SET status_perangkat = 'OFFLINE'
     WHERE status_perangkat = 'ONLINE'
       AND TIMESTAMPDIFF(SECOND, terakhir_terlihat, NOW()) > ?`,
    [thresholdSeconds]
  );
}

module.exports = { findByIdAndKey, findById, setOnline, markOfflineStale };
