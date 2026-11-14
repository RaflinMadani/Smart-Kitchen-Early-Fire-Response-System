// ================================================================
// main.js — entry point, orchestration, tab routing, polling loop
// ================================================================
import { DEVICE_ID, POLL_MS } from './config.js';
import {
  appState, chartHistory, pushChartPoint, seedChartHistory,
} from './state.js';
import {
  fetchStatus, fetchReadings, fetchAlerts, fetchDevices,
} from './api.js';
import {
  getMockStatus, getMockAlerts, getMockDevices, advanceMockCycle, isMock,
} from './mock.js';
import {
  renderDashboard, renderControlTab, renderAlertTable, renderDevicesTable,
  setConnectionStatus, setLastUpdated, showMockBadge, setDeviceOfflineLock,
} from './ui.js';
import { initChart, updateChart } from './charts.js';
import { syncControl } from './control.js';

// ── Tab routing ───────────────────────────────────────────────────
const TABS = ['dashboard', 'kontrol', 'riwayat', 'perangkat'];

// Chart.js tidak bisa diinisialisasi saat canvas masih hidden (tinggi 0px).
// Gunakan flag agar initChart() hanya dipanggil sekali, saat tab riwayat
// pertama kali ditampilkan (canvas sudah visible dan punya dimensi).
let chartInitialized = false;

function activateTab(name) {
  if (!TABS.includes(name)) name = 'dashboard';
  TABS.forEach(t => {
    const panel = document.getElementById(`tab-${t}`);
    const btn   = document.querySelector(`[data-tab="${t}"]`);
    if (!panel || !btn) return;
    if (t === name) {
      panel.classList.remove('hidden');
      btn.className = 'tab-btn tab-active px-4 py-3 text-sm font-medium border-b-2';
    } else {
      panel.classList.add('hidden');
      btn.className = 'tab-btn px-4 py-3 text-sm font-medium border-b-2 border-transparent text-gray-400 hover:text-gray-200';
    }
  });
  window.location.hash = name;
  // Lazy-init + lazy-load saat tab riwayat dibuka
  if (name === 'riwayat') {
    if (!chartInitialized) {
      chartInitialized = true;
      initChart();       // canvas kini visible → aman diinisialisasi
      updateChart();     // gambar data yang sudah ada di chartHistory
    }
    loadRiwayat();
  }
  if (name === 'perangkat') loadPerangkat();
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab));
});

// Hash routing
function handleHash() {
  const hash = window.location.hash.replace('#', '') || 'dashboard';
  activateTab(hash);
}
window.addEventListener('hashchange', handleHash);

// ── Polling loop ─────────────────────────────────────────────────
let consecutiveFails = 0;

async function pollStatus() {
  let result;
  if (isMock) {
    advanceMockCycle();
    result = getMockStatus();
  } else {
    result = await fetchStatus(DEVICE_ID);
  }

  if (!result.ok || !result.data) {
    consecutiveFails++;
    setConnectionStatus('server_down');
    setDeviceOfflineLock(true);
    return;
  }
  consecutiveFails = 0;

  const d = result.data;

  // Perangkat terdaftar tapi belum ada data sensor (sensor_logs kosong)
  // kode_state null → tampilkan state 1 (AMAN/OFFLINE) agar UI tidak crash
  appState.kodeState       = d.kode_state        ?? 1;
  appState.tingkatRisiko   = d.tingkat_risiko     ?? 'AMAN';
  appState.suhu            = d.suhu_celcius       ?? null;
  appState.rh              = d.kelembapan_rh      ?? null;
  appState.mq2Adc          = d.mq2_adc            ?? null;
  appState.statusApi       = d.status_api         ?? 'TIDAK_ADA';
  appState.statusKipas     = d.status_kipas       ?? 'OFF';
  appState.statusPompa     = d.status_pompa       ?? 'OFF';
  appState.statusBuzzer    = d.status_buzzer      ?? 'DIAM';
  appState.waktuRekam      = d.waktu_rekam        ?? null;
  appState.idDevice        = d.id_device;
  appState.lokasi          = d.lokasi;
  appState.statusPerangkat = d.status_perangkat   ?? 'OFFLINE';

  // ── BUG FIX: Indikator koneksi berbasis status_perangkat dari DB ──
  // "Terhubung" hanya jika ESP32 benar-benar ONLINE di database,
  // bukan hanya karena server HTTP bisa diakses.
  const deviceOnline = d.status_perangkat === 'ONLINE';
  setConnectionStatus(deviceOnline ? 'device_online' : 'device_offline');
  setDeviceOfflineLock(!deviceOnline);

  setLastUpdated(d.waktu_rekam);

  // Sync control state
  await syncControl();

  // Append to chart history
  const t = d.waktu_rekam ? d.waktu_rekam.slice(11, 19) : '--:--:--';
  pushChartPoint(t, d.mq2_adc, d.suhu_celcius);

  // Render
  renderDashboard();
  renderControlTab();
  updateChart();
}

// ── Alert filter ─────────────────────────────────────────────────
let currentAlertFilter = '';

function setAlertFilter(status) {
  currentAlertFilter = status;
  const idMap = { '': 'all', 'AKTIF': 'aktif', 'SELESAI': 'selesai' };
  document.querySelectorAll('.alert-filter-btn').forEach(b => {
    const isActive = b === document.getElementById(`alert-filter-${idMap[status] || 'all'}`);
    b.className = isActive
      ? 'alert-filter-btn filter-active text-xs px-3 py-1 rounded-full'
      : 'alert-filter-btn text-xs px-3 py-1 rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600';
  });
  loadRiwayat();
}

document.getElementById('alert-filter-all').addEventListener('click',     () => setAlertFilter(''));
document.getElementById('alert-filter-aktif').addEventListener('click',   () => setAlertFilter('AKTIF'));
document.getElementById('alert-filter-selesai').addEventListener('click', () => setAlertFilter('SELESAI'));
document.getElementById('btn-refresh-alerts').addEventListener('click',   () => loadRiwayat());
document.getElementById('btn-refresh-devices').addEventListener('click',  () => loadPerangkat());

// ── Riwayat loader ────────────────────────────────────────────────
// BUG FIX: Langsung ambil dari DB tanpa limit saat Muat Ulang diklik
async function loadRiwayat() {
  let result;
  if (isMock) {
    result = getMockAlerts();
  } else {
    result = await fetchAlerts(DEVICE_ID, currentAlertFilter);
  }
  renderAlertTable(result.ok ? result.data : []);
}

// ── Perangkat loader ──────────────────────────────────────────────
async function loadPerangkat() {
  let result;
  if (isMock) {
    result = getMockDevices();
  } else {
    result = await fetchDevices();
  }
  renderDevicesTable(result.ok ? result.data : []);
}

// ── Chart history seed ────────────────────────────────────────────
// BUG FIX: Seed data riwayat dari MySQL langsung saat halaman dimuat
async function seedHistory() {
  if (isMock) return; // mock uses push-only
  const result = await fetchReadings(DEVICE_ID, 60);
  if (result.ok && result.data) {
    seedChartHistory(result.data);
    updateChart();
  }
}

// ── Boot ──────────────────────────────────────────────────────────
async function boot() {
  if (isMock) showMockBadge();

  // handleHash() menentukan tab aktif pertama kali.
  // Jika hash = #riwayat, initChart() otomatis dipanggil di dalam activateTab().
  // Jika hash lain (dashboard default), chart diinit saat user klik tab Riwayat.
  handleHash();

  // Seed chart history dari MySQL (di-cache di chartHistory, dirender saat tab dibuka)
  await seedHistory();

  // First poll immediately
  await pollStatus();

  // Then schedule polling
  setInterval(pollStatus, POLL_MS);
}

boot();
