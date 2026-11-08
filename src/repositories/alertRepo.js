'use strict';
const pool = require('../config/db');

async function getAlerts(idDevice, status) {
  let sql = `SELECT * FROM alert_logs WHERE id_device = ?`;
  const params = [idDevice];
  if (status) { sql += ' AND status_alert = ?'; params.push(status.toUpperCase()); }
  sql += ' ORDER BY waktu_mulai DESC LIMIT 20';
  const [rows] = await pool.execute(sql, params);
  return rows;
}

module.exports = { getAlerts };
