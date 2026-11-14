'use strict';
const pool = require('../config/db');

/**
 * Ambil semua riwayat peringatan untuk satu perangkat.
 * Tidak ada LIMIT di sini — dashboard menampilkan semua data dari DB.
 * @param {string} idDevice
 * @param {string} [status]  'AKTIF' | 'SELESAI' | '' (semua)
 * @param {number} [limit]   optional max baris (default tidak terbatas)
 */
async function getAlerts(idDevice, status, limit) {
  let sql = `SELECT id_alert, id_device, state_puncak, tingkat_risiko,
                    status_alert, waktu_mulai, waktu_selesai
             FROM alert_logs WHERE id_device = ?`;
  const params = [idDevice];
  if (status) {
    sql += ' AND status_alert = ?';
    params.push(status.toUpperCase());
  }
  sql += ' ORDER BY waktu_mulai DESC';
  // Allow caller to cap; default no cap (return all)
  const safeLimit = limit ? Math.min(parseInt(limit, 10) || 500, 1000) : null;
  if (safeLimit) { sql += ' LIMIT ?'; params.push(safeLimit); }
  const [rows] = await pool.execute(sql, params);
  return rows;
}

module.exports = { getAlerts };
