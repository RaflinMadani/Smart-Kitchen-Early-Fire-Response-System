'use strict';

/**
 * Insert a sensor log row (inside a transaction connection).
 * Returns the inserted id_log.
 */
async function insert(conn, {
  idDevice, waktuRekam, suhu, rh, mq2Adc, statusApi,
  kodeState, tingkatRisiko, statusKipas, statusPompa,
  statusBuzzer, sumberKontrol,
}) {
  const [result] = await conn.execute(
    `INSERT INTO sensor_logs
      (id_device, waktu_rekam, suhu_celcius, kelembapan_rh, mq2_adc, status_api,
       kode_state, tingkat_risiko, status_kipas, status_pompa, status_buzzer, sumber_kontrol)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [idDevice, waktuRekam, suhu, rh, mq2Adc, statusApi,
     kodeState, tingkatRisiko, statusKipas, statusPompa, statusBuzzer, sumberKontrol]
  );
  return result.insertId;
}

/**
 * Get recent readings for a device (for history endpoint).
 */
async function getReadings(idDevice, from, to, limit) {
  const safeLimit = Math.min(parseInt(limit, 10) || 100, 1000);
  let sql = `SELECT * FROM sensor_logs WHERE id_device = ?`;
  const params = [idDevice];
  if (from) { sql += ' AND waktu_rekam >= ?'; params.push(from); }
  if (to)   { sql += ' AND waktu_rekam <= ?'; params.push(to); }
  sql += ' ORDER BY waktu_rekam DESC LIMIT ?';
  params.push(safeLimit);
  const [rows] = await require('../config/db').execute(sql, params);
  return rows;
}

module.exports = { insert, getReadings };
