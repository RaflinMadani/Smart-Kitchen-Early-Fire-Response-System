// ================================================================
// config.js — Smart Kitchen Dashboard
// Satu-satunya file yang perlu diubah saat pindah server
// ================================================================

/** Base URL backend. Kosong = same-origin (pakai saat frontend di-serve Express) */
export const BASE_URL = '';

/** ID perangkat utama yang ditampilkan di dashboard */
export const DEVICE_ID = 'DAPUR01';

/** Interval polling data real-time (ms) */
export const POLL_MS = 3000;

/** Timeout setiap fetch request (ms) */
export const FETCH_TIMEOUT_MS = 4000;

/** Ambang ADC MQ-2 untuk penanda garis di grafik (1000 PPM ≈ ADC 1000) */
export const AMBANG_ASAP = 1000;

/** Nilai ADC penuh (12-bit ESP32) */
export const ADC_MAX = 4095;

/**
 * ADMIN_TOKEN dikirim sebagai Bearer token ke semua endpoint selain /health.
 * Isi dengan nilai ADMIN_TOKEN yang sama di .env VPS.
 * CATATAN KEAMANAN: token ini tampak di source browser — hanya untuk demo.
 * Di produksi, tambahkan halaman login yang meminta token dari server.
 */
export const ADMIN_TOKEN = 'Smart*2026';  // ← ganti sesuai .env

/** Berapa titik data disimpan di memori untuk grafik */
export const CHART_MAX_POINTS = 60;
