// ================================================================
// mock.js — data palsu yang bergilir state 1→8 untuk mode demo
// Aktif saat URL mengandung ?mock=1
// ================================================================
import { AMBANG_ASAP } from './config.js';

const MOCK_CYCLE = [
  // state 1: normal
  { kode_state: 1, tingkat_risiko: 'AMAN',    suhu_celcius: 28.5, kelembapan_rh: 60, mq2_adc: 120, status_api: 'TIDAK_ADA', status_kipas: 'OFF', status_pompa: 'OFF', status_buzzer: 'DIAM' },
  // state 2: thermal warning
  { kode_state: 2, tingkat_risiko: 'WASPADA', suhu_celcius: 42.1, kelembapan_rh: 55, mq2_adc: 150, status_api: 'TIDAK_ADA', status_kipas: 'ON',  status_pompa: 'OFF', status_buzzer: 'BERDENYUT' },
  // state 3: gas/smoke warning
  { kode_state: 3, tingkat_risiko: 'WASPADA', suhu_celcius: 30.0, kelembapan_rh: 58, mq2_adc: 450, status_api: 'TIDAK_ADA', status_kipas: 'ON',  status_pompa: 'OFF', status_buzzer: 'BERDENYUT' },
  // state 4: pre-combustion
  { kode_state: 4, tingkat_risiko: 'WASPADA', suhu_celcius: 43.5, kelembapan_rh: 52, mq2_adc: 520, status_api: 'TIDAK_ADA', status_kipas: 'ON',  status_pompa: 'OFF', status_buzzer: 'BERDENYUT' },
  // state 5: api saja
  { kode_state: 5, tingkat_risiko: 'BAHAYA',  suhu_celcius: 33.0, kelembapan_rh: 50, mq2_adc: 180, status_api: 'TERDETEKSI', status_kipas: 'OFF', status_pompa: 'ON',  status_buzzer: 'KONTINU' },
  // state 6: api + panas
  { kode_state: 6, tingkat_risiko: 'BAHAYA',  suhu_celcius: 46.0, kelembapan_rh: 48, mq2_adc: 200, status_api: 'TERDETEKSI', status_kipas: 'OFF', status_pompa: 'ON',  status_buzzer: 'KONTINU' },
  // state 7: api + asap
  { kode_state: 7, tingkat_risiko: 'BAHAYA',  suhu_celcius: 35.0, kelembapan_rh: 45, mq2_adc: 580, status_api: 'TERDETEKSI', status_kipas: 'OFF', status_pompa: 'ON',  status_buzzer: 'KONTINU' },
  // state 8: kebakaran penuh
  { kode_state: 8, tingkat_risiko: 'BAHAYA',  suhu_celcius: 52.0, kelembapan_rh: 40, mq2_adc: 900, status_api: 'TERDETEKSI', status_kipas: 'OFF', status_pompa: 'ON',  status_buzzer: 'KONTINU' },
];

let mockIdx = 0;
let mockControl = { cmd_kipas: 'AUTO', cmd_pompa: 'AUTO', cmd_buzzer: 'AUTO', sumber_kontrol: 'OTOMATIS' };

function nowStr() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/** Kembalikan data status mock (mirip format v_status_terbaru) */
export function getMockStatus() {
  const s = MOCK_CYCLE[mockIdx];
  return {
    ok: true,
    data: {
      id_device:         'DAPUR01',
      lokasi:            'Dapur Bersama Lt. 1',
      status_perangkat:  'ONLINE',
      waktu_rekam:       nowStr(),
      suhu_celcius:      s.suhu_celcius,
      kelembapan_rh:     s.kelembapan_rh,
      mq2_adc:           s.mq2_adc,
      status_api:        s.status_api,
      kode_state:        s.kode_state,
      tingkat_risiko:    s.tingkat_risiko,
      status_kipas:      s.status_kipas,
      status_pompa:      s.status_pompa,
      status_buzzer:     s.status_buzzer,
    },
  };
}

/** Kembalikan data control mock */
export function getMockControl() {
  return { ok: true, data: { ...mockControl, terakhir_diubah: nowStr() } };
}

/** Kembalikan alerts mock */
export function getMockAlerts() {
  return {
    ok: true,
    data: [
      { id_alert: 2, id_device: 'DAPUR01', state_puncak: 8, tingkat_risiko: 'BAHAYA',  status_alert: 'SELESAI', waktu_mulai: '2025-01-08 10:05:00', waktu_selesai: '2025-01-08 10:07:30' },
      { id_alert: 1, id_device: 'DAPUR01', state_puncak: 3, tingkat_risiko: 'WASPADA', status_alert: 'SELESAI', waktu_mulai: '2025-01-08 09:50:00', waktu_selesai: '2025-01-08 09:51:10' },
    ],
  };
}

/** Kembalikan devices mock */
export function getMockDevices() {
  return {
    ok: true,
    data: [
      { id_device: 'DAPUR01', lokasi: 'Dapur Bersama Lt. 1', status_perangkat: 'ONLINE', terakhir_terlihat: nowStr() },
    ],
  };
}

/** Kembalikan PUT control mock (apply perubahan) */
export function mockPutControl(body) {
  if (body.kipas  !== undefined) mockControl.cmd_kipas  = body.kipas;
  if (body.pompa  !== undefined) mockControl.cmd_pompa  = body.pompa;
  if (body.buzzer !== undefined) mockControl.cmd_buzzer = body.buzzer;
  const isManual = [mockControl.cmd_kipas, mockControl.cmd_pompa, mockControl.cmd_buzzer].some(v => v !== 'AUTO');
  mockControl.sumber_kontrol = isManual ? 'MANUAL_APP' : 'OTOMATIS';
  return { ok: true, data: { ...mockControl, terakhir_diubah: nowStr() } };
}

/** Maju ke step berikutnya dalam siklus (dipanggil tiap polling) */
export function advanceMockCycle() {
  mockIdx = (mockIdx + 1) % MOCK_CYCLE.length;
}

export const isMock = new URLSearchParams(window.location.search).get('mock') === '1';
