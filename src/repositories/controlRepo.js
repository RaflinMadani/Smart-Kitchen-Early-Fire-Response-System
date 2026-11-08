'use strict';
const pool = require('../config/db');

async function getControl(idDevice) {
  const [rows] = await pool.execute(
    'SELECT * FROM device_control WHERE id_device = ?',
    [idDevice]
  );
  return rows[0] || null;
}

async function updateControl(idDevice, fields) {
  const allowed = ['cmd_kipas', 'cmd_pompa', 'cmd_buzzer', 'sumber_kontrol'];
  const setClauses = [];
  const params = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      setClauses.push(`${key} = ?`);
      params.push(fields[key]);
    }
  }
  if (setClauses.length === 0) return;
  params.push(idDevice);
  await pool.execute(
    `UPDATE device_control SET ${setClauses.join(', ')} WHERE id_device = ?`,
    params
  );
}

async function revertPompaManual(maxSeconds) {
  // Revert pump manual ON after maxSeconds; preserve terakhir_diubah timestamp
  await pool.execute(
    `UPDATE device_control
     SET cmd_pompa = 'AUTO', terakhir_diubah = terakhir_diubah
     WHERE cmd_pompa = 'ON'
       AND TIMESTAMPDIFF(SECOND, terakhir_diubah, NOW()) > ?`,
    [maxSeconds]
  );
}

async function revertAllManual(revertSeconds) {
  await pool.execute(
    `UPDATE device_control
     SET cmd_kipas = 'AUTO', cmd_pompa = 'AUTO', cmd_buzzer = 'AUTO',
         sumber_kontrol = 'OTOMATIS', terakhir_diubah = terakhir_diubah
     WHERE sumber_kontrol = 'MANUAL_APP'
       AND TIMESTAMPDIFF(SECOND, terakhir_diubah, NOW()) > ?`,
    [revertSeconds]
  );
}

module.exports = { getControl, updateControl, revertPompaManual, revertAllManual };
