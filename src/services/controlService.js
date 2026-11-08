'use strict';
const { getAutoAction } = require('./stateEngine');

/**
 * Merge automatic action with manual overrides from device_control.
 * Applies safety rules per blueprint section 6.
 *
 * @param {number} kode  - calculated state 1-8
 * @param {object} ctrl  - row from device_control
 * @returns {{ kipas, pompa, buzzer, led, sumber }}
 */
function applyControl(kode, ctrl) {
  const final = { ...getAutoAction(kode) };

  // Apply manual overrides
  if (ctrl.cmd_kipas  !== 'AUTO') final.kipas  = ctrl.cmd_kipas;
  if (ctrl.cmd_pompa  !== 'AUTO') final.pompa  = ctrl.cmd_pompa;
  if (ctrl.cmd_buzzer === 'MUTE') final.buzzer = 'DIAM';
  if (ctrl.cmd_buzzer === 'ON')   final.buzzer = 'KONTINU';

  // === Safety rules ===
  // State 5-8: fan must be OFF (don't feed oxygen to fire)
  if (kode >= 5) final.kipas = 'OFF';
  // State 5-8: buzzer MUTE is forbidden (critical alarm cannot be silenced)
  if (kode >= 5 && ctrl.cmd_buzzer === 'MUTE') final.buzzer = 'KONTINU';

  // Determine control source
  const isManual =
    ctrl.cmd_kipas  !== 'AUTO' ||
    ctrl.cmd_pompa  !== 'AUTO' ||
    ctrl.cmd_buzzer !== 'AUTO';

  const sumber = isManual ? 'MANUAL_APP' : 'OTOMATIS';

  return { ...final, sumber };
}

module.exports = { applyControl };
