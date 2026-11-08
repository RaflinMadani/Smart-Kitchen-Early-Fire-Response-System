'use strict';

/**
 * Calculate system state (pure function, no DB).
 *
 * kode_state formula:  1 + (api?4:0) + (asap?2:0) + (panas?1:0)
 * tingkat_risiko:      1=AMAN  2-4=WASPADA  5-8=BAHAYA
 *
 * Tabel aksi otomatis:
 * 1         → kipas OFF, pompa OFF, buzzer DIAM,      led HIJAU
 * 2-4       → kipas ON,  pompa OFF, buzzer BERDENYUT, led MERAH_KEDIP
 * 5-7       → kipas OFF, pompa ON,  buzzer KONTINU,   led MERAH_KEDIP
 * 8         → kipas OFF, pompa ON,  buzzer KONTINU,   led MERAH_TETAP
 */
function calcState(suhu, mq2Adc, apiFlag, ambangAsap, ambangSuhu) {
  const asap  = (mq2Adc != null) && (mq2Adc > ambangAsap);
  const panas = (suhu != null)   && (suhu > ambangSuhu);
  const kode  = 1 + (apiFlag ? 4 : 0) + (asap ? 2 : 0) + (panas ? 1 : 0);
  return kode;
}

function getRisiko(kode) {
  if (kode === 1) return 'AMAN';
  if (kode <= 4)  return 'WASPADA';
  return 'BAHAYA';
}

function getStatusApi(apiFlag) {
  return apiFlag ? 'TERDETEKSI' : 'TIDAK_ADA';
}

function getAutoAction(kode) {
  if (kode === 1) {
    return { kipas: 'OFF', pompa: 'OFF', buzzer: 'DIAM',      led: 'HIJAU' };
  }
  if (kode <= 4) {
    return { kipas: 'ON',  pompa: 'OFF', buzzer: 'BERDENYUT', led: 'MERAH_KEDIP' };
  }
  if (kode <= 7) {
    return { kipas: 'OFF', pompa: 'ON',  buzzer: 'KONTINU',   led: 'MERAH_KEDIP' };
  }
  // kode === 8
  return { kipas: 'OFF', pompa: 'ON',  buzzer: 'KONTINU',   led: 'MERAH_TETAP' };
}

module.exports = { calcState, getRisiko, getStatusApi, getAutoAction };
