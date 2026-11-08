// ================================================================
// config.h — Smart Kitchen Early Fire Response System
// Ganti PROFILE_WOKWI ke 0 untuk hardware fisik
// ================================================================
#pragma once

// ── Profile ──────────────────────────────────────────────────────
#define PROFILE_WOKWI 1   // 1 = Wokwi | 0 = skematik fisik

// ── WiFi ─────────────────────────────────────────────────────────
#if PROFILE_WOKWI
  #define WIFI_SSID "Wokwi-GUEST"
  #define WIFI_PASS ""
#else
  #define WIFI_SSID "SSID_WIFI_ANDA"
  #define WIFI_PASS "PASSWORD_WIFI_ANDA"
#endif

// ── Server ───────────────────────────────────────────────────────
#define SERVER_URL "http://103.181.182.36:3000/api/v1/ingest"
#define API_KEY    "Smart*2026"   // harus cocok hash di DB
#define DEVICE_ID  "DAPUR01"

// ── Timing (ms) ──────────────────────────────────────────────────
#define INTERVAL_MS          5000UL   // kirim tiap 5 detik
#define DHT_MIN_INTERVAL_MS  2000UL   // DHT butuh minimal 2 detik antar baca
#define HTTP_TIMEOUT_MS      4000     // timeout POST
#define PUMP_MAX_ON_MS      10000UL   // batas pompa ON berturut-turut (local safety)
#define PUMP_PAUSE_MS       10000UL   // jeda pompa setelah batas
#define MQ2_WARMUP_MS       20000UL   // pemanasan MQ-2 (lewati di Wokwi)

// ── Threshold (logika cadangan lokal, harus sama dengan .env) ────
#define SMOKE_THRESHOLD  300
#define TEMP_THRESHOLD   40.0f

// ── Sensor ───────────────────────────────────────────────────────
#define DHTTYPE DHT22          // ganti ke DHT11 jika pakai DHT11 fisik
#define FLAME_ACTIVE LOW       // ubah ke HIGH jika modul berlawanan

// ── Pin mapping ──────────────────────────────────────────────────
#if PROFILE_WOKWI
  // Wokwi: relay modul aktif-HIGH (konfirmasi dulu polaritas)
  #define PIN_DHT        22
  #define PIN_GAS        15
  #define PIN_FLAME      16
  #define PIN_LED_GREEN  19
  #define PIN_LED_RED    21
  #define PIN_BUZZER     23
  #define PIN_FAN         2
  #define PIN_PUMP       17
  #define ACT_ON         HIGH
  #define ACT_OFF        LOW
#else
  // Fisik: MOSFET aktif-HIGH, ADC1 untuk MQ-2
  // HINDARI GPIO2 (strapping), GPIO15 (ADC2, konflik Wi-Fi)
  #define PIN_DHT         4
  #define PIN_GAS        35   // ADC1 ch7 — pakai pembagi tegangan 3.3 V
  #define PIN_FLAME       5   // strapping-pin aman asal tidak dibebani saat boot
  #define PIN_LED_GREEN  18
  #define PIN_LED_RED    19
  #define PIN_BUZZER     21
  #define PIN_FAN        22   // gate MOSFET
  #define PIN_PUMP       23
  #define ACT_ON         HIGH
  #define ACT_OFF        LOW
#endif
