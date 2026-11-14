// ================================================================
// config.h — Smart Kitchen Early Fire Response System v2
// Ganti PROFILE_WOKWI ke 0 untuk hardware fisik
// ================================================================
#pragma once

// ── Profile ──────────────────────────────────────────────────────
#define PROFILE_WOKWI 1   // 1 = Wokwi simulasi | 0 = hardware fisik

// ── WiFi ─────────────────────────────────────────────────────────
#if PROFILE_WOKWI
  #define WIFI_SSID "Wokwi-GUEST"
  #define WIFI_PASS ""
#else
  #define WIFI_SSID "Hulala"
  #define WIFI_PASS "nasigorengtahu"
#endif

// ── MQTT EMQX Cloud (TLS/SSL port 8883) ──────────────────────────
#define MQTT_HOST "e751b1cd.ala.asia-southeast1.emqxsl.com"
#define MQTT_PORT 8883

// Kredensial MQTT — buat user di EMQX Dashboard → Authentication
// CATATAN: Ganti dengan user/pass yang dibuat di EMQX Cloud Console
#define MQTT_USER "smart_kitchen_esp32"
#define MQTT_PASS "Smart*2026"

// ── HTTP Fallback (ke VPS jika MQTT gagal) ───────────────────────
#define SERVER_URL "http://103.181.182.36:3000/api/v1/ingest"
#define API_KEY    "Smart*2026"   // harus cocok hash di DB
#define DEVICE_ID  "DAPUR01"

// ── Timing (ms) ──────────────────────────────────────────────────
#define INTERVAL_MS          5000UL   // kirim data sensor tiap 5 detik
#define DHT_MIN_INTERVAL_MS  2000UL   // DHT22 butuh minimal 2 detik antar baca
#define HTTP_TIMEOUT_MS      4000     // timeout HTTP POST fallback
#define PUMP_MAX_ON_MS      10000UL   // batas pompa ON berturut-turut (safety lokal)
#define PUMP_PAUSE_MS       10000UL   // jeda paksa setelah batas pompa
#define MQ2_WARMUP_MS       20000UL   // pemanasan MQ-2 (dilewati di Wokwi)
#define MQTT_RECON_MS        5000UL   // interval reconnect MQTT

// ── Threshold ────────────────────────────────────────────────────
// Harus sama dengan nilai AMBANG_ASAP di file .env server
#define SMOKE_THRESHOLD  1000       // ADC 12-bit (0-4095); 1000 ≈ asap memasak terlewat
#define TEMP_THRESHOLD   40.0f      // °C

// ── Sensor ───────────────────────────────────────────────────────
#define DHTTYPE     DHT22    // ganti ke DHT11 jika pakai DHT11 fisik
#define FLAME_ACTIVE LOW     // ubah ke HIGH jika modul KY-026 Anda berlawanan

// ── Pin mapping ──────────────────────────────────────────────────
#if PROFILE_WOKWI
  // Wokwi simulation: relay/MOSFET aktif-HIGH
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
  // Hardware fisik: MOSFET aktif-HIGH, ADC1 untuk MQ-2
  // HINDARI GPIO2 (boot strapping), GPIO15 (ADC2, konflik Wi-Fi)
  #define PIN_DHT         4
  #define PIN_GAS        35   // ADC1 ch7 — sambungkan lewat pembagi tegangan 3.3V
  #define PIN_FLAME       5   // strapping-pin aman asal tidak dibebani saat boot
  #define PIN_LED_GREEN  18
  #define PIN_LED_RED    19
  #define PIN_BUZZER     21
  #define PIN_FAN        22   // gate MOSFET / IN relay kipas
  #define PIN_PUMP       23   // gate MOSFET / IN relay pompa
  #define ACT_ON         HIGH
  #define ACT_OFF        LOW
#endif

// ── Catatan integrasi Wokwi ───────────────────────────────────────
// Wokwi tidak mendukung WiFiClientSecure + TLS secara penuh.
// Untuk simulasi lengkap MQTT, gunakan:
//   wifiSecure.setInsecure() (sudah diterapkan di setup())
// atau mock MQTT dengan mengomentari bagian mqttClient.connect() di mqttConnect()
// dan menggantinya dengan HTTP fallback saja selama simulasi Wokwi.
