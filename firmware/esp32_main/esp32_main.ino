// ================================================================
// esp32_main.ino — Smart Kitchen Early Fire Response System v2
// Protokol: MQTT over TLS (EMQX Cloud port 8883) + HTTP POST fallback
// Logika pompa: HYBRID — lokal langsung + server sinkronisasi
// Simulasi Wokwi: PROFILE_WOKWI = 1  |  Hardware fisik: 0
// ================================================================
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include "config.h"

// ── TLS Client ───────────────────────────────────────────────────
WiFiClientSecure wifiSecure;

// ── MQTT Client ──────────────────────────────────────────────────
PubSubClient mqttClient(wifiSecure);

// ── DHT ──────────────────────────────────────────────────────────
DHT dht(PIN_DHT, DHTTYPE);

// ── Topics ───────────────────────────────────────────────────────
// Publish: smartkitchen/{DEVICE_ID}/sensor
// Subscribe: smartkitchen/{DEVICE_ID}/command
#define TOPIC_SENSOR  "smartkitchen/" DEVICE_ID "/sensor"
#define TOPIC_CMD     "smartkitchen/" DEVICE_ID "/command"
#define TOPIC_STATUS  "smartkitchen/server/status"

// ── Struct respons server ─────────────────────────────────────────
struct ServerCmd {
  bool   kipas;
  bool   pompa;
  String buzzer;  // "DIAM" | "BERDENYUT" | "KONTINU"
  String led;     // "HIJAU" | "MERAH_KEDIP" | "MERAH_TETAP"
  int    state;
  bool   valid;
};

// ── State aktuator ────────────────────────────────────────────────
static bool     curFan    = false;
static bool     curPump   = false;
static String   curBuzzer = "DIAM";
static String   curLed    = "HIJAU";
static int      curState  = 1;

// ── Timing ───────────────────────────────────────────────────────
static unsigned long tLastSend    = 0;
static unsigned long tLastDHT     = 0;
static unsigned long tLastBlink   = 0;
static unsigned long tPumpOn      = 0;
static bool          pumpPaused   = false;
static unsigned long tPumpPause   = 0;
static unsigned long tLastMqttRecon = 0;

// ── Sensor cache ─────────────────────────────────────────────────
static float cachedTemp = NAN;
static float cachedRH   = NAN;

// ── MQTT pending command (dari callback) ─────────────────────────
static bool      pendingCmd = false;
static ServerCmd pendingCmdData;

// ── Prototipe ────────────────────────────────────────────────────
void   connectWiFi();
bool   mqttConnect();
void   mqttCallback(char* topic, byte* payload, unsigned int length);
void   publishSensorData(float suhu, float rh, int adc, int api);
bool   postReadingHTTP(float suhu, float rh, int adc, int api, ServerCmd &r);
void   applyCommand(const ServerCmd &cmd);
void   applyLocal(int kode);
int    calcStateLocal(float suhu, int adc, int api);
void   runBuzzerPattern();
void   runLedPattern();
void   pumpSafetyCheck();

// ================================================================
// setup()
// ================================================================
void setup() {
  Serial.begin(115200);
  delay(200);

  // Matikan aktuator SEBELUM pinMode untuk menghindari nyala sesaat
  digitalWrite(PIN_FAN,       ACT_OFF);
  digitalWrite(PIN_PUMP,      ACT_OFF);
  digitalWrite(PIN_LED_GREEN, LOW);
  digitalWrite(PIN_LED_RED,   LOW);
  digitalWrite(PIN_BUZZER,    LOW);

  pinMode(PIN_FAN,       OUTPUT);
  pinMode(PIN_PUMP,      OUTPUT);
  pinMode(PIN_LED_GREEN, OUTPUT);
  pinMode(PIN_LED_RED,   OUTPUT);
  pinMode(PIN_BUZZER,    OUTPUT);
  pinMode(PIN_FLAME,     INPUT);

  dht.begin();
  connectWiFi();

#if !PROFILE_WOKWI
  Serial.println("[boot] Menunggu pemanasan MQ-2 (20 detik)...");
  unsigned long t0 = millis();
  while (millis() - t0 < MQ2_WARMUP_MS) {
    delay(500); Serial.print('.');
  }
  Serial.println("\n[boot] MQ-2 siap");
#endif

  // TLS: skip verifikasi sertifikat (setInsecure = terpercaya untuk demo)
  // Produksi: gunakan wifiSecure.setCACert(rootCACert) dengan sertifikat EMQX
  wifiSecure.setInsecure();

  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(512);
  mqttClient.setKeepAlive(30);

  mqttConnect();

  Serial.println("[boot] Smart Kitchen ESP32 v2 siap");
}

// ================================================================
// loop() — sepenuhnya non-blocking
// ================================================================
void loop() {
  unsigned long now = millis();

  // ── Jaga koneksi MQTT ─────────────────────────────────────────
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  } else if (!mqttClient.connected()) {
    if (now - tLastMqttRecon >= MQTT_RECON_MS) {
      tLastMqttRecon = now;
      mqttConnect();
    }
  } else {
    mqttClient.loop();   // proses pesan masuk
  }

  // ── Proses command MQTT yang masuk dari server ────────────────
  if (pendingCmd) {
    pendingCmd = false;
    Serial.printf("[mqtt] ← CMD state=%d kipas=%d pompa=%d buzzer=%s\n",
                  pendingCmdData.state, pendingCmdData.kipas, pendingCmdData.pompa,
                  pendingCmdData.buzzer.c_str());
    // Hanya terapkan jika bukan pompa (pompa dikelola hybrid local)
    // Server tetap bisa override pompa via command
    applyCommand(pendingCmdData);
    curState = pendingCmdData.state;
  }

  // ── Baca DHT minimal tiap 2 detik ────────────────────────────
  if (now - tLastDHT >= DHT_MIN_INTERVAL_MS) {
    tLastDHT = now;
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t)) cachedTemp = t;
    if (!isnan(h)) cachedRH   = h;
  }

  // ── Kirim data sensor tiap INTERVAL_MS ───────────────────────
  if (now - tLastSend >= INTERVAL_MS) {
    tLastSend = now;

    int  adc    = analogRead(PIN_GAS);
    int  flame  = digitalRead(PIN_FLAME);
    int  apiVal = (flame == FLAME_ACTIVE) ? 1 : 0;

    Serial.printf("[sensor] suhu=%.1f rh=%.1f adc=%d api=%d\n",
                  cachedTemp, cachedRH, adc, apiVal);

    // ── HYBRID LOGIC: hitung state lokal terlebih dahulu ─────────
    int kodeLokal = calcStateLocal(cachedTemp, adc, apiVal);

    // ── POMPA LOCAL-FIRST: aktifkan pompa LANGSUNG tanpa tunggu server
    // jika state >= 5 (kondisi bahaya) dan pompa belum menyala
    if (kodeLokal >= 5 && !curPump && !pumpPaused) {
      Serial.println("[hybrid] BAHAYA — pompa aktif lokal (tanpa server)");
      curPump = true;
      tPumpOn = millis();
      digitalWrite(PIN_PUMP, ACT_ON);
      curBuzzer = "KONTINU";
      curLed    = kodeLokal == 8 ? "MERAH_TETAP" : "MERAH_KEDIP";
      curFan    = false;
      digitalWrite(PIN_FAN, ACT_OFF);
    } else if (kodeLokal < 5 && curPump && curState < 5) {
      // Pompa mati jika kondisi aman (dan server juga belum kasih perintah bahaya)
      curPump = false;
      digitalWrite(PIN_PUMP, ACT_OFF);
    }

    curState = kodeLokal;  // update state lokal sementara

    // ── Kirim ke server via MQTT (data reporting) ─────────────────
    if (mqttClient.connected()) {
      publishSensorData(cachedTemp, cachedRH, adc, apiVal);
      // Server akan membalas via topic command jika ada override manual
    } else {
      // Fallback ke HTTP POST jika MQTT tidak tersambung
      ServerCmd resp;
      bool ok = postReadingHTTP(cachedTemp, cachedRH, adc, apiVal, resp);
      if (ok) {
        curState = resp.state;
        Serial.printf("[http] state=%d kipas=%d pompa=%d\n",
                      resp.state, resp.kipas, resp.pompa);
        // HTTP response: apply hanya kipas/buzzer/led
        // POMPA: hanya ikuti server jika server minta MATI (mencegah double-trigger)
        if (!resp.pompa && curPump && resp.state < 5) {
          curPump = false;
          digitalWrite(PIN_PUMP, ACT_OFF);
        }
        curFan    = resp.kipas;
        curBuzzer = resp.buzzer;
        curLed    = resp.led;
        digitalWrite(PIN_FAN, curFan ? ACT_ON : ACT_OFF);
      } else {
        Serial.println("[fallback] lokal aktif");
        applyLocal(kodeLokal);
        if (WiFi.status() != WL_CONNECTED) connectWiFi();
      }
    }
  }

  // ── Pola buzzer dan LED (non-blocking) ────────────────────────
  runBuzzerPattern();
  runLedPattern();

  // ── Safety pompa: batas ON berkelanjutan ──────────────────────
  pumpSafetyCheck();
}

// ================================================================
// mqttCallback() — terima command dari server
// ================================================================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String topicStr(topic);

  // smartkitchen/{DEVICE_ID}/command
  if (topicStr == String(TOPIC_CMD)) {
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, payload, length);
    if (err) {
      Serial.println("[mqtt] JSON parse error pada command");
      return;
    }

    ServerCmd cmd;
    cmd.valid  = true;
    cmd.state  = doc["state"]  | curState;

    // Kipas
    const char* kipasVal = doc["kipas"] | "NOCHANGE";
    if (strcmp(kipasVal, "ON")  == 0) cmd.kipas = true;
    else if (strcmp(kipasVal, "OFF") == 0) cmd.kipas = false;
    else cmd.kipas = curFan;

    // Pompa — server hanya bisa MEMATIKAN (OFF) pompa yang sudah ON lokal,
    // atau menyalakan untuk intervensi manual pengguna via dashboard
    const char* pompaVal = doc["pompa"] | "NOCHANGE";
    if (strcmp(pompaVal, "ON")  == 0) cmd.pompa = true;
    else if (strcmp(pompaVal, "OFF") == 0) cmd.pompa = false;
    else cmd.pompa = curPump;

    // Buzzer
    const char* buzzerVal = doc["buzzer"] | "NOCHANGE";
    if (strcmp(buzzerVal, "NOCHANGE") != 0) cmd.buzzer = String(buzzerVal);
    else cmd.buzzer = curBuzzer;

    // LED
    const char* ledVal = doc["led"] | "NOCHANGE";
    if (strcmp(ledVal, "NOCHANGE") != 0) cmd.led = String(ledVal);
    else cmd.led = curLed;

    pendingCmd     = true;
    pendingCmdData = cmd;
  }
}

// ================================================================
// publishSensorData() — kirim data sensor ke broker MQTT
// ================================================================
void publishSensorData(float suhu, float rh, int adc, int api) {
  JsonDocument doc;
  doc["id_device"] = DEVICE_ID;
  if (isnan(suhu)) doc["suhu"] = nullptr; else doc["suhu"] = suhu;
  if (isnan(rh))   doc["rh"]   = nullptr; else doc["rh"]   = rh;
  doc["mq2_adc"] = adc;
  doc["api"]     = api;
  doc["kipas"]   = (digitalRead(PIN_FAN)  == ACT_ON) ? 1 : 0;
  doc["pompa"]   = (digitalRead(PIN_PUMP) == ACT_ON) ? 1 : 0;
  doc["ts"]      = (long)millis();

  char buf[256];
  size_t n = serializeJson(doc, buf, sizeof(buf));
  if (!mqttClient.publish(TOPIC_SENSOR, buf, n)) {
    Serial.println("[mqtt] Publish sensor gagal");
  }
}

// ================================================================
// postReadingHTTP() — fallback HTTP POST ke backend
// ================================================================
bool postReadingHTTP(float suhu, float rh, int adc, int api, ServerCmd &r) {
  if (WiFi.status() != WL_CONNECTED) return false;

  // HTTP (non-TLS) untuk HTTP fallback ke VPS
  WiFiClient    httpClient;
  HTTPClient    http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  if (!http.begin(httpClient, SERVER_URL)) return false;

  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key",    API_KEY);

  JsonDocument doc;
  doc["id_device"] = DEVICE_ID;
  if (isnan(suhu)) doc["suhu"] = nullptr; else doc["suhu"] = suhu;
  if (isnan(rh))   doc["rh"]   = nullptr; else doc["rh"]   = rh;
  doc["mq2_adc"] = adc;
  doc["api"]     = api;
  doc["kipas"]   = (digitalRead(PIN_FAN)  == ACT_ON) ? 1 : 0;
  doc["pompa"]   = (digitalRead(PIN_PUMP) == ACT_ON) ? 1 : 0;

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  if (code != 200) {
    Serial.printf("[http] HTTP %d\n", code);
    http.end();
    return false;
  }

  JsonDocument res;
  DeserializationError err = deserializeJson(res, http.getString());
  http.end();
  if (err) return false;

  r.state  = res["state"]  | 1;
  r.valid  = true;
  r.kipas  = strcmp(res["kipas"]  | "OFF", "ON") == 0;
  r.pompa  = strcmp(res["pompa"]  | "OFF", "ON") == 0;
  r.buzzer = String(res["buzzer"] | "DIAM");
  r.led    = String(res["led"]    | "HIJAU");
  return true;
}

// ================================================================
// applyCommand() — terapkan command dari server/MQTT
// Pompa: server bisa override ON (manual dari dashboard) ATAU OFF
// ================================================================
void applyCommand(const ServerCmd &cmd) {
  // Kipas — safety: state >= 5 kipas harus OFF
  bool targetFan = (curState >= 5) ? false : cmd.kipas;
  if (targetFan != curFan) {
    curFan = targetFan;
    digitalWrite(PIN_FAN, curFan ? ACT_ON : ACT_OFF);
  }

  // Pompa — hybrid: lokal sudah ON karena bahaya, server sinkronisasi
  if (cmd.pompa && !curPump && !pumpPaused) {
    curPump = true;
    tPumpOn = millis();
    digitalWrite(PIN_PUMP, ACT_ON);
    Serial.println("[cmd] Pompa ON (server/manual)");
  } else if (!cmd.pompa && curPump) {
    curPump = false;
    digitalWrite(PIN_PUMP, ACT_OFF);
    Serial.println("[cmd] Pompa OFF (server/manual)");
  }

  // Buzzer — state >= 5 tidak bisa dibisukan
  if (curState >= 5) {
    curBuzzer = "KONTINU";
  } else {
    curBuzzer = cmd.buzzer;
  }

  curLed = cmd.led;
}

// ================================================================
// applyLocal() — aktuasi mandiri saat server tidak bisa dihubungi
// ================================================================
void applyLocal(int kode) {
  ServerCmd r;
  r.state = kode; r.valid = true;
  if (kode == 1) {
    r.kipas = false; r.pompa = false; r.buzzer = "DIAM";      r.led = "HIJAU";
  } else if (kode <= 4) {
    r.kipas = true;  r.pompa = false; r.buzzer = "BERDENYUT"; r.led = "MERAH_KEDIP";
  } else if (kode <= 7) {
    r.kipas = false; r.pompa = true;  r.buzzer = "KONTINU";   r.led = "MERAH_KEDIP";
  } else {
    r.kipas = false; r.pompa = true;  r.buzzer = "KONTINU";   r.led = "MERAH_TETAP";
  }
  if (kode >= 5) r.kipas = false;
  applyCommand(r);
}

// ================================================================
// calcStateLocal() — hitung state dari sensor lokal
// ================================================================
int calcStateLocal(float suhu, int adc, int api) {
  bool asap  = (adc > SMOKE_THRESHOLD);
  bool panas = (!isnan(suhu) && suhu > TEMP_THRESHOLD);
  return 1 + (api ? 4 : 0) + (asap ? 2 : 0) + (panas ? 1 : 0);
}

// ================================================================
// pumpSafetyCheck() — batas pompa ON berturut-turut (lokal safety)
// ================================================================
void pumpSafetyCheck() {
  if (curPump && !pumpPaused) {
    if (millis() - tPumpOn >= PUMP_MAX_ON_MS) {
      digitalWrite(PIN_PUMP, ACT_OFF);
      curPump    = false;
      pumpPaused = true;
      tPumpPause = millis();
      Serial.println("[safety] Pompa jeda paksa (batas 10 detik)");
    }
  }
  if (pumpPaused && (millis() - tPumpPause >= PUMP_PAUSE_MS)) {
    pumpPaused = false;
    Serial.println("[safety] Pompa jeda selesai — siap aktif kembali");
  }
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
// mqttConnect() — sambung ke broker EMQX Cloud TLS
// ================================================================
bool mqttConnect() {
  if (WiFi.status() != WL_CONNECTED) return false;
  Serial.printf("[mqtt] Menyambung ke %s:%d ...\n", MQTT_HOST, MQTT_PORT);

  // Will message: perangkat offline
  JsonDocument willDoc;
  willDoc["online"]    = false;
  willDoc["id_device"] = DEVICE_ID;
  willDoc["ts"]        = (long)millis();
  char willBuf[128];
  serializeJson(willDoc, willBuf, sizeof(willBuf));

  String clientId = String("esp32-") + DEVICE_ID + "-" + String(millis());

  if (mqttClient.connect(clientId.c_str(),
                         MQTT_USER, MQTT_PASS,
                         "smartkitchen/" DEVICE_ID "/lwt",
                         1, true, willBuf)) {
    Serial.println("[mqtt] Terhubung ke EMQX");

    // Subscribe ke topik command dari server
    mqttClient.subscribe(TOPIC_CMD, 1);
    // Subscribe ke status server (opsional, untuk deteksi server online)
    mqttClient.subscribe(TOPIC_STATUS, 0);

    // Publish birth message
    JsonDocument birthDoc;
    birthDoc["online"]    = true;
    birthDoc["id_device"] = DEVICE_ID;
    birthDoc["ts"]        = (long)millis();
    char birthBuf[128];
    serializeJson(birthDoc, birthBuf, sizeof(birthBuf));
    mqttClient.publish("smartkitchen/" DEVICE_ID "/lwt", birthBuf, true);

    return true;
  } else {
    Serial.printf("[mqtt] Gagal (rc=%d) — fallback HTTP\n", mqttClient.state());
    return false;
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
    delay(300); Serial.print('.');
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[wifi] Terhubung, IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[wifi] Gagal — mode offline lokal aktif");
  }
}
