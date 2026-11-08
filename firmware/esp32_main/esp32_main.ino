// ================================================================
// esp32_main.ino — Smart Kitchen Early Fire Response System
// Firmware ESP32 · Non-blocking millis() · HTTP POST ke VPS
// ================================================================
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include "config.h"

// ── DHT ──────────────────────────────────────────────────────────
DHT dht(PIN_DHT, DHTTYPE);

// ── Struktur respons server ───────────────────────────────────────
struct ServerResp {
  int    state;
  bool   kipas;
  bool   pompa;
  String buzzer;  // "DIAM" | "BERDENYUT" | "KONTINU"
  String led;     // "HIJAU" | "MERAH_KEDIP" | "MERAH_TETAP"
};

// ── State aktuator saat ini ───────────────────────────────────────
static bool     curFan    = false;
static bool     curPump   = false;
static String   curBuzzer = "DIAM";
static String   curLed    = "HIJAU";
static int      curState  = 1;

// ── Timing ───────────────────────────────────────────────────────
static unsigned long tLastSend    = 0;
static unsigned long tLastDHT     = 0;
static unsigned long tLastBlink   = 0;
static unsigned long tPumpOn      = 0;   // kapan pompa mulai ON (lokal)
static bool          pumpPaused   = false;
static unsigned long tPumpPause   = 0;

// ── Nilai sensor ter-cache ────────────────────────────────────────
static float cachedTemp = NAN;
static float cachedRH   = NAN;

// ── Prototipe ────────────────────────────────────────────────────
bool   postReading(float suhu, float rh, int adc, int api, ServerResp &r);
void   applyActuators(const ServerResp &r);
void   applyActuatorsLocal(int kode);
int    calcStateLocal(float suhu, int adc, int api);
void   runBuzzerPattern();
void   runLedPattern();
void   connectWiFi();

// ================================================================
// setup()
// ================================================================
void setup() {
  Serial.begin(115200);
  delay(200);

  // ── Aktuator: matikan SEBELUM pinMode supaya tidak nyala sesaat
  digitalWrite(PIN_FAN,  ACT_OFF);
  digitalWrite(PIN_PUMP, ACT_OFF);
  digitalWrite(PIN_LED_GREEN, LOW);
  digitalWrite(PIN_LED_RED,   LOW);
  digitalWrite(PIN_BUZZER,    LOW);

  pinMode(PIN_FAN,       OUTPUT);
  pinMode(PIN_PUMP,      OUTPUT);
  pinMode(PIN_LED_GREEN, OUTPUT);
  pinMode(PIN_LED_RED,   OUTPUT);
  pinMode(PIN_BUZZER,    OUTPUT);
  pinMode(PIN_FLAME,     INPUT);
  // GAS dibaca analogRead, tidak perlu pinMode khusus

  dht.begin();

  connectWiFi();

#if !PROFILE_WOKWI
  // Tunggu pemanasan MQ-2 di perangkat fisik
  Serial.println("[boot] Menunggu pemanasan MQ-2...");
  unsigned long t0 = millis();
  while (millis() - t0 < MQ2_WARMUP_MS) {
    delay(500);
    Serial.print('.');
  }
  Serial.println("\n[boot] MQ-2 siap");
#endif

  Serial.println("[boot] Smart Kitchen ESP32 siap");
}

// ================================================================
// loop() — sepenuhnya non-blocking
// ================================================================
void loop() {
  unsigned long now = millis();

  // ── Baca DHT (minimal tiap 2 detik) ───────────────────────────
  if (now - tLastDHT >= DHT_MIN_INTERVAL_MS) {
    tLastDHT = now;
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t)) cachedTemp = t;
    if (!isnan(h)) cachedRH   = h;
  }

  // ── Kirim ke server tiap INTERVAL_MS ──────────────────────────
  if (now - tLastSend >= INTERVAL_MS) {
    tLastSend = now;

    int  adc    = analogRead(PIN_GAS);
    int  flame  = digitalRead(PIN_FLAME);
    int  apiVal = (flame == FLAME_ACTIVE) ? 1 : 0;

    Serial.printf("[sensor] suhu=%.1f rh=%.1f adc=%d api=%d\n",
                  cachedTemp, cachedRH, adc, apiVal);

    ServerResp resp;
    bool ok = postReading(cachedTemp, cachedRH, adc, apiVal, resp);

    if (ok) {
      curState = resp.state;
      Serial.printf("[server] state=%d kipas=%d pompa=%d buzzer=%s led=%s\n",
                    resp.state, resp.kipas, resp.pompa,
                    resp.buzzer.c_str(), resp.led.c_str());
      applyActuators(resp);
    } else {
      Serial.println("[server] POST gagal — logika lokal aktif");
      int kode = calcStateLocal(cachedTemp, adc, apiVal);
      curState = kode;
      applyActuatorsLocal(kode);

      // Coba sambung ulang Wi-Fi jika putus
      if (WiFi.status() != WL_CONNECTED) connectWiFi();
    }
  }

  // ── Pola buzzer dan LED (non-blocking) ─────────────────────────
  runBuzzerPattern();
  runLedPattern();

  // ── Keamanan pompa lokal: batas ON berkelanjutan ───────────────
  if (curPump && !pumpPaused) {
    if (millis() - tPumpOn >= PUMP_MAX_ON_MS) {
      // Jeda paksa
      digitalWrite(PIN_PUMP, ACT_OFF);
      curPump    = false;
      pumpPaused = true;
      tPumpPause = millis();
      Serial.println("[safety] Pompa jeda paksa (batas 10 detik)");
    }
  }
  if (pumpPaused && (millis() - tPumpPause >= PUMP_PAUSE_MS)) {
    pumpPaused = false;  // izinkan pompa hidup lagi pada siklus berikutnya
  }
}

// ================================================================
// postReading() — kirim POST dan parse respons
// ================================================================
bool postReading(float suhu, float rh, int adc, int api, ServerResp &r) {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClient  client;
  HTTPClient  http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  if (!http.begin(client, SERVER_URL)) return false;

  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key",    API_KEY);

  // Bangun JSON
  JsonDocument doc;
  doc["id_device"] = DEVICE_ID;
  if (isnan(suhu)) doc["suhu"] = nullptr; else doc["suhu"] = suhu;
  if (isnan(rh))   doc["rh"]   = nullptr; else doc["rh"]   = rh;
  doc["mq2_adc"]   = adc;
  doc["api"]       = api;
  doc["kipas"]     = (digitalRead(PIN_FAN)  == ACT_ON) ? 1 : 0;
  doc["pompa"]     = (digitalRead(PIN_PUMP) == ACT_ON) ? 1 : 0;

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  if (code != 200) {
    Serial.printf("[http] HTTP %d\n", code);
    http.end();
    return false;
  }

  // Parse respons
  JsonDocument res;
  DeserializationError err = deserializeJson(res, http.getString());
  http.end();
  if (err) {
    Serial.println("[http] JSON parse error");
    return false;
  }

  r.state  = res["state"]  | 1;
  r.kipas  = strcmp(res["kipas"]  | "OFF", "ON") == 0;
  r.pompa  = strcmp(res["pompa"]  | "OFF", "ON") == 0;
  r.buzzer = String(res["buzzer"] | "DIAM");
  r.led    = String(res["led"]    | "HIJAU");
  return true;
}

// ================================================================
// applyActuators() — terapkan perintah dari server
// ================================================================
void applyActuators(const ServerResp &r) {
  // Kipas
  if (r.kipas != curFan) {
    curFan = r.kipas;
    if (!pumpPaused || !curFan) {   // pompa tidak memengaruhi kipas
      digitalWrite(PIN_FAN, curFan ? ACT_ON : ACT_OFF);
    }
  }

  // Pompa (dengan pelacak waktu untuk safety lokal)
  if (r.pompa && !curPump && !pumpPaused) {
    curPump = true;
    tPumpOn = millis();
    digitalWrite(PIN_PUMP, ACT_ON);
  } else if (!r.pompa && curPump) {
    curPump = false;
    digitalWrite(PIN_PUMP, ACT_OFF);
  }

  // Buzzer & LED: hanya simpan state; pola dijalankan di runBuzzerPattern/runLedPattern
  curBuzzer = r.buzzer;
  curLed    = r.led;
}

// ================================================================
// calcStateLocal() — kode state dari sensor lokal (fallback)
// ================================================================
int calcStateLocal(float suhu, int adc, int api) {
  bool asap  = (adc  > SMOKE_THRESHOLD);
  bool panas = (!isnan(suhu) && suhu > TEMP_THRESHOLD);
  return 1 + (api ? 4 : 0) + (asap ? 2 : 0) + (panas ? 1 : 0);
}

// ================================================================
// applyActuatorsLocal() — aktuasi mandiri saat server tidak bisa dihubungi
// ================================================================
void applyActuatorsLocal(int kode) {
  ServerResp r;
  r.state  = kode;
  if (kode == 1) {
    r.kipas = false; r.pompa = false; r.buzzer = "DIAM";      r.led = "HIJAU";
  } else if (kode <= 4) {
    r.kipas = true;  r.pompa = false; r.buzzer = "BERDENYUT"; r.led = "MERAH_KEDIP";
  } else if (kode <= 7) {
    r.kipas = false; r.pompa = true;  r.buzzer = "KONTINU";   r.led = "MERAH_KEDIP";
  } else {
    r.kipas = false; r.pompa = true;  r.buzzer = "KONTINU";   r.led = "MERAH_TETAP";
  }
  // Keamanan: state >= 5 kipas harus OFF
  if (kode >= 5) r.kipas = false;
  applyActuators(r);
}

// ================================================================
// runBuzzerPattern() — non-blocking buzzer patterns
// ================================================================
void runBuzzerPattern() {
  static bool buzOn = false;
  unsigned long now = millis();

  if (curBuzzer == "DIAM") {
    if (buzOn) { digitalWrite(PIN_BUZZER, LOW); buzOn = false; }
  } else if (curBuzzer == "BERDENYUT") {
    if (now - tLastBlink >= 500) {
      tLastBlink = now;
      buzOn = !buzOn;
      digitalWrite(PIN_BUZZER, buzOn ? HIGH : LOW);
    }
  } else { // "KONTINU"
    if (!buzOn) { digitalWrite(PIN_BUZZER, HIGH); buzOn = true; }
  }
}

// ================================================================
// runLedPattern() — non-blocking LED patterns
// ================================================================
void runLedPattern() {
  static bool     ledBlinkOn = false;
  static unsigned long tBlink = 0;
  unsigned long   now = millis();

  if (curLed == "HIJAU") {
    digitalWrite(PIN_LED_GREEN, HIGH);
    digitalWrite(PIN_LED_RED,   LOW);
    ledBlinkOn = false;
  } else if (curLed == "MERAH_TETAP") {
    digitalWrite(PIN_LED_GREEN, LOW);
    digitalWrite(PIN_LED_RED,   HIGH);
    ledBlinkOn = false;
  } else { // "MERAH_KEDIP"
    digitalWrite(PIN_LED_GREEN, LOW);
    if (now - tBlink >= 400) {
      tBlink = now;
      ledBlinkOn = !ledBlinkOn;
      digitalWrite(PIN_LED_RED, ledBlinkOn ? HIGH : LOW);
    }
  }
}

// ================================================================
// connectWiFi() — sambung dengan timeout
// ================================================================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.printf("[wifi] Menyambung ke %s ...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000UL) {
    delay(300);
    Serial.print('.');
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[wifi] Terhubung, IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[wifi] Gagal terhubung — mode offline aktif");
  }
}
