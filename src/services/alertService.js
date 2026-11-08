'use strict';

/**
 * Alert lifecycle management (runs inside the same DB transaction as sensor_logs insert).
 *
 * Rules (blueprint section 6):
 *  - kode >= 2 : open episode if none active; escalate state_puncak if higher
 *  - kode == 1 : close episode after 3 consecutive safe readings
 *
 * @param {object} conn      - mysql2 connection (from transaction)
 * @param {string} idDevice
 * @param {number} kode
 * @param {string} risiko
 * @param {bigint|number} idLog - id of the sensor_log just inserted
 */
async function handleAlert(conn, idDevice, kode, risiko, idLog) {
  // Lock the active alert row if any
  const [rows] = await conn.execute(
    `SELECT id_alert, state_puncak FROM alert_logs
     WHERE id_device = ? AND status_alert = 'AKTIF'
     ORDER BY id_alert DESC LIMIT 1 FOR UPDATE`,
    [idDevice]
  );
  const aktif = rows[0] || null;

  if (kode >= 2) {
    if (!aktif) {
      // Open new alert episode
      await conn.execute(
        `INSERT INTO alert_logs (id_device, id_log_pemicu, state_puncak, tingkat_risiko, waktu_mulai)
         VALUES (?, ?, ?, ?, NOW())`,
        [idDevice, idLog, kode, risiko]
      );
    } else if (kode > aktif.state_puncak) {
      // Escalate peak state
      await conn.execute(
        `UPDATE alert_logs SET state_puncak = ?, tingkat_risiko = ? WHERE id_alert = ?`,
        [kode, risiko, aktif.id_alert]
      );
    }
  } else if (kode === 1 && aktif) {
    // Check last 3 readings - close only if all safe
    const [recent] = await conn.execute(
      `SELECT kode_state FROM sensor_logs
       WHERE id_device = ? ORDER BY id_log DESC LIMIT 3`,
      [idDevice]
    );
    const allSafe = recent.length >= 3 && recent.every(r => r.kode_state === 1);
    if (allSafe) {
      await conn.execute(
        `UPDATE alert_logs SET status_alert = 'SELESAI', waktu_selesai = NOW()
         WHERE id_alert = ?`,
        [aktif.id_alert]
      );
    }
  }
}

module.exports = { handleAlert };
