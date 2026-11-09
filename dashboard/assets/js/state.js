// ================================================================
// state.js — shared reactive state + chart history buffer
// Tidak ada DOM di sini; hanya data mentah.
// ================================================================
import { CHART_MAX_POINTS } from './config.js';

/**
 * Snapshot terbaru dari backend (v_status_terbaru + control row).
 * Diperbarui oleh main.js setiap polling.
 */
export const appState = {
  // Sensor & state
  kodeState:     1,
  tingkatRisiko: 'AMAN',
  suhu:          null,
  rh:            null,
  mq2Adc:        null,
  statusApi:     'TIDAK_ADA',
  statusKipas:   'OFF',
  statusPompa:   'OFF',
  statusBuzzer:  'DIAM',
  waktuRekam:    null,
  // Device
  idDevice:      '—',
  lokasi:        '—',
  statusPerangkat: 'OFFLINE',
  terakhirTerlihat: null,
  // Control
  cmdKipas:      'AUTO',
  cmdPompa:      'AUTO',
  cmdBuzzer:     'AUTO',
  sumberKontrol: 'OTOMATIS',
  // Meta
  serverOnline:  false,
  lastFetchAt:   null,
};

/** Circular buffer untuk grafik (max CHART_MAX_POINTS titik) */
export const chartHistory = {
  /** @type {string[]} */  labels:  [],
  /** @type {number[]} */  mq2:     [],
  /** @type {(number|null)[]} */ suhu: [],
};

/**
 * Tambah satu titik ke riwayat grafik.
 * @param {string} label - waktu singkat "HH:MM:SS"
 * @param {number|null} mq2
 * @param {number|null} suhu
 */
export function pushChartPoint(label, mq2, suhu) {
  chartHistory.labels.push(label);
  chartHistory.mq2.push(mq2 ?? null);
  chartHistory.suhu.push(suhu ?? null);
  if (chartHistory.labels.length > CHART_MAX_POINTS) {
    chartHistory.labels.shift();
    chartHistory.mq2.shift();
    chartHistory.suhu.shift();
  }
}

/**
 * Muat riwayat pembacaan dari endpoint readings (dipanggil sekali saat init).
 * @param {Array} rows - array dari sensor_logs (terbaru dulu)
 */
export function seedChartHistory(rows) {
  // rows datang urutan DESC; balik dulu agar kronologis
  const ordered = [...rows].reverse();
  chartHistory.labels.length = 0;
  chartHistory.mq2.length    = 0;
  chartHistory.suhu.length   = 0;
  for (const r of ordered.slice(-CHART_MAX_POINTS)) {
    const t = r.waktu_rekam ? r.waktu_rekam.slice(11, 19) : '—';
    chartHistory.labels.push(t);
    chartHistory.mq2.push(r.mq2_adc != null ? Number(r.mq2_adc) : null);
    chartHistory.suhu.push(r.suhu_celcius != null ? Number(r.suhu_celcius) : null);
  }
}

// ── Metadata state ────────────────────────────────────────────────

export const STATE_META = {
  1: { nama: 'Normal',            kategori: 'NORMAL',  icon: '🟢', warna: 'normal',  desc: 'Kondisi aman. Semua sensor dalam batas normal.' },
  2: { nama: 'Thermal Warning',   kategori: 'WASPADA', icon: '🟡', warna: 'waspada', desc: 'Suhu di atas ambang. Kipas aktif otomatis.' },
  3: { nama: 'Gas/Smoke Warning', kategori: 'WASPADA', icon: '🟡', warna: 'waspada', desc: 'Gas/asap terdeteksi. Kipas aktif otomatis.' },
  4: { nama: 'Pre-Combustion',    kategori: 'WASPADA', icon: '🟠', warna: 'waspada', desc: 'Suhu + gas tinggi. Waspada potensi kebakaran!' },
  5: { nama: 'Api Terdeteksi',    kategori: 'BAHAYA',  icon: '🔴', warna: 'bahaya',  desc: 'API TERDETEKSI. Pompa aktif. Kipas dimatikan.' },
  6: { nama: 'Api + Panas',       kategori: 'BAHAYA',  icon: '🔴', warna: 'bahaya',  desc: 'API + PANAS. Kebakaran aktif!' },
  7: { nama: 'Api + Asap',        kategori: 'BAHAYA',  icon: '🔴', warna: 'bahaya',  desc: 'API + ASAP. Kebakaran aktif!' },
  8: { nama: 'Kebakaran Penuh',   kategori: 'BAHAYA',  icon: '🔥', warna: 'bahaya',  desc: 'API + ASAP + PANAS. Segera evakuasi!' },
};
