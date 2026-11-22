#pragma once
#include <Arduino.h>
#include "EnvLoader.h"

// ── Runtime Config Struct ────────────────────────────────────────
struct RuntimeConfig {
  String   mqttHost;
  uint16_t mqttPort;
  String   mqttUser;
  String   mqttPass;
  String   serverUrl;
  String   apiKey;
  String   deviceId;
  String   wifiSsid;
  String   wifiPass;

  // Pre-built MQTT topics
  String   topicSensor;
  String   topicCmd;
  String   topicLwt;
};

extern RuntimeConfig cfg;

inline bool initConfigFromEnv(const char* path = "../.env") {
  EnvLoader env;
  if (!env.load(path)) {
    return false;
  }

  cfg.mqttHost  = env.get("MQTT_HOST");
  cfg.mqttPort  = static_cast<uint16_t>(env.getInt("MQTT_PORT", 8883));
  cfg.mqttUser  = env.get("MQTT_USER");
  cfg.mqttPass  = env.get("MQTT_PASS");
  cfg.serverUrl = env.get("SERVER_URL");
  cfg.apiKey    = env.get("API_KEY");
  cfg.deviceId  = env.get("DEVICE_ID", "esp32-01");
  cfg.wifiSsid  = env.get("WIFI_SSID");
  cfg.wifiPass  = env.get("WIFI_PASS");

  env.clear();

  if (cfg.wifiSsid.isEmpty() || cfg.mqttHost.isEmpty()) {
    Serial.println("[config] Error: WIFI_SSID atau MQTT_HOST kosong di .env");
    return false;
  }

  cfg.topicSensor = "smartkitchen/" + cfg.deviceId + "/sensor";
  cfg.topicCmd    = "smartkitchen/" + cfg.deviceId + "/command";
  cfg.topicLwt    = "smartkitchen/" + cfg.deviceId + "/lwt";
  return true;
}

// ── Simulasi / Hardware Profile ──────────────────────────────────
#ifndef PROFILE_WOKWI
  #define PROFILE_WOKWI 0
#endif

// ── Timing (ms) ──────────────────────────────────────────────────
#define INTERVAL_MS          5000UL   // kirim data sensor tiap 5 detik
#define DHT_MIN_INTERVAL_MS  2000UL   // DHT22 butuh minimal 2 detik antar baca
#define HTTP_TIMEOUT_MS      4000     // timeout HTTP POST fallback
#define PUMP_MAX_ON_MS      10000UL   // batas pompa ON berturut-turut (safety lokal)
#define PUMP_PAUSE_MS       10000UL   // jeda paksa setelah batas pompa
#define MQ2_WARMUP_MS       20000UL   // pemanasan MQ-2 (dilewati di Wokwi)
#define MQTT_RECON_MS        5000UL   // interval reconnect MQTT

// ── Threshold ────────────────────────────────────────────────────
#define SMOKE_THRESHOLD  900         // ADC 12-bit (0-4095); 1000 ≈ asap memasak terlewat
#define TEMP_THRESHOLD   40.0f        // °C

// ── Sensor ───────────────────────────────────────────────────────
#define DHTTYPE     DHT11             // ganti ke DHT22 jika pakai DHT22 fisik
#define FLAME_ACTIVE LOW              // ubah ke HIGH jika modul KY-026 Anda berlawanan

// ── Pin mapping ──────────────────────────────────────────────────
#define PIN_DHT        18
#define PIN_GAS        35             // ADC1 ch7 — sambungkan lewat pembagi tegangan 3.3V
#define PIN_FLAME       5             // strapping-pin aman asal tidak dibebani saat boot
#define PIN_LED_GREEN  16
#define PIN_LED_RED    17
#define PIN_BUZZER     19
#define PIN_FAN        25             // gate MOSFET / IN relay kipas
#define PIN_PUMP       26             // gate MOSFET / IN relay pompa
#define ACT_ON         HIGH
#define ACT_OFF        LOW