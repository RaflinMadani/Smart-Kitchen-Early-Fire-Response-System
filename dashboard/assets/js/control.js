// ================================================================
// control.js — semua logika tombol kontrol manual
// ================================================================
import { appState } from './state.js';
import { putControl, fetchControl } from './api.js';
import { mockPutControl, getMockControl, isMock } from './mock.js';
import { setCtrlBusy, showCtrlNotif, renderControlTab, startPumpCountdown, stopPumpCountdown } from './ui.js';

// ── Dialog konfirmasi pompa ────────────────────────────────────────
const overlay = document.getElementById('pump-confirm-overlay');
document.getElementById('pump-confirm-yes').addEventListener('click', () => {
  overlay.classList.add('hidden');
  _sendControl({ pompa: 'ON' }, true);
});
document.getElementById('pump-confirm-no').addEventListener('click', () => {
  overlay.classList.add('hidden');
});

// ── Tombol bisukan alarm dari banner darurat ───────────────────────
document.getElementById('btn-mute-banner').addEventListener('click', () => {
  if (appState.kodeState >= 5) {
    showCtrlNotif('🚫 Alarm kritis tidak dapat dibisukan (state 5–8)', false);
    return;
  }
  _sendControl({ buzzer: 'MUTE' });
});

// ── Event listener tombol kontrol ─────────────────────────────────
document.querySelectorAll('.ctrl-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const ctrl = btn.dataset.ctrl;   // 'kipas' | 'pompa' | 'buzzer'
    const val  = btn.dataset.val;    // 'AUTO' | 'ON' | 'OFF' | 'MUTE'

    // Safety gate: kipas ON saat state >= 5
    if (ctrl === 'kipas' && val === 'ON' && appState.kodeState >= 5) {
      showCtrlNotif('⚠️ Api aktif: kipas tidak dapat dinyalakan', false);
      return;
    }
    // Safety gate: buzzer MUTE saat state >= 5
    if (ctrl === 'buzzer' && val === 'MUTE' && appState.kodeState >= 5) {
      showCtrlNotif('🚫 Alarm kritis tidak dapat dibisukan (state 5–8)', false);
      return;
    }
    // Pompa ON → tampilkan dialog konfirmasi dulu
    if (ctrl === 'pompa' && val === 'ON') {
      overlay.classList.remove('hidden');
      return;
    }

    await _sendControl({ [ctrl]: val });
  });
});

/**
 * Kirim perintah kontrol ke backend / mock.
 * @param {Object} body  mis. { kipas: 'ON' } | { buzzer: 'MUTE' }
 * @param {boolean} isPump  apakah ini perintah pompa ON (untuk hitung mundur)
 */
async function _sendControl(body, isPump = false) {
  setCtrlBusy(true);
  try {
    let result;
    if (isMock) {
      result = mockPutControl(body);
    } else {
      result = await putControl(appState.idDevice, body);
    }

    if (!result.ok) {
      showCtrlNotif(`❌ Gagal: ${result.error || 'Error tidak diketahui'}`, false);
      return;
    }

    // Perbarui appState.cmd* dari respons
    const d = result.data;
    appState.cmdKipas      = d.cmd_kipas  || appState.cmdKipas;
    appState.cmdPompa      = d.cmd_pompa  || appState.cmdPompa;
    appState.cmdBuzzer     = d.cmd_buzzer || appState.cmdBuzzer;
    appState.sumberKontrol = d.sumber_kontrol || appState.sumberKontrol;

    renderControlTab();

    // Hitung mundur pompa manual
    if (isPump && body.pompa === 'ON') {
      startPumpCountdown(10);
    } else if (body.pompa === 'AUTO' || body.pompa === 'OFF') {
      stopPumpCountdown();
    }

    showCtrlNotif(`✅ Berhasil: ${Object.entries(body).map(([k,v]) => `${k.toUpperCase()}=${v}`).join(', ')}`, true);
  } finally {
    setCtrlBusy(false);
  }
}

/** Sinkronisasi state kontrol dari server (dipanggil setelah polling) */
export async function syncControl() {
  let result;
  if (isMock) {
    result = getMockControl();
  } else {
    result = await fetchControl(appState.idDevice);
  }
  if (result.ok && result.data) {
    const d = result.data;
    appState.cmdKipas      = d.cmd_kipas      || 'AUTO';
    appState.cmdPompa      = d.cmd_pompa      || 'AUTO';
    appState.cmdBuzzer     = d.cmd_buzzer     || 'AUTO';
    appState.sumberKontrol = d.sumber_kontrol || 'OTOMATIS';
  }
}
