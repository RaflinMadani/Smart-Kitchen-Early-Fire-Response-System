# 🔥 Smart Kitchen Early Fire Response System

**Tema Proyek:** Internet of Things (IoT) — Sistem Keamanan & Otomasi Rumah Tangga

> **Deskripsi Singkat:** Sistem deteksi dan respons kebakaran dini berbasis IoT untuk dapur. Menggabungkan sensor fisik pada ESP32 (suhu, gas, api), backend Node.js, komunikasi MQTT real-time via EMQX Cloud, dashboard monitoring berbasis web, serta notifikasi otomatis ke Telegram saat kondisi bahaya terdeteksi.

---

## 📑 Daftar Isi

- [Gambaran Umum](#-gambaran-umum)
- [Arsitektur Sistem](#-arsitektur-sistem)
- [Alur Data & Cara Kerja](#-alur-data--cara-kerja)
- [State Engine & Logika Risiko](#-state-engine--logika-risiko)
- [Fitur Lengkap](#-fitur-lengkap)
- [Struktur Folder](#-struktur-folder)
- [Skema Database](#-skema-database)
- [API Reference](#-api-reference)
- [Autentikasi](#-autentikasi)
- [Background Jobs](#-background-jobs)
- [Firmware ESP32](#-firmware-esp32)
- [Instalasi & Setup](#-instalasi--setup)
- [Environment Variables](#-environment-variables)
- [Deployment dengan PM2](#-deployment-dengan-pm2)
- [Tech Stack](#-tech-stack)

---

## 🌐 Gambaran Umum

**Smart Kitchen Early Fire Response System** adalah sistem IoT end-to-end yang dirancang untuk mendeteksi risiko kebakaran di dapur secara real-time dan merespons secara otomatis sebelum kebakaran menjadi besar.

```
┌──────────────┐    MQTT/HTTP    ┌───────────────────┐    HTTP/WS    ┌──────────────┐
│  ESP32 + Sensor│ ──────────────▶ │  Node.js Backend  │ ──────────────▶ │  Dashboard   │
│  - DHT22       │                 │  (Express + MySQL) │               │  (HTML/JS)   │
│  - MQ-2        │ ◀────────────── │  VPS: 103.181.x.x  │               └──────────────┘
│  - Flame Sensor│    CMD (MQTT)   └───────────────────┘
└──────────────┘                           │
                                           │ Telegram Bot
                                           ▼
                                  ┌─────────────────┐
                                  │  EMQX Cloud      │
                                  │  (MQTT Broker    │
                                  │   TLS port 8883) │
                                  └─────────────────┘
```

**Komponen utama:**
| Komponen | Teknologi | Fungsi |
|---|---|---|
| Sensor Node | ESP32 + DHT22 + MQ-2 + KY-026 | Baca sensor, kendalikan aktuator |
| Message Broker | EMQX Cloud (TLS/SSL) | Transport MQTT real-time |
| Backend API | Node.js + Express + MySQL | Proses data, state engine, alert |
| Dashboard | HTML/JS static | Monitor & kontrol manual |
| Notifikasi | Telegram Bot | Alert bahaya ke operator |

---

## 🏗 Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────────────┐
│                          ESP32 Firmware                              │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────────────┐  │
│  │  DHT22   │  │   MQ-2   │  │ KY-026    │  │  Aktuator         │  │
│  │  Suhu/RH │  │  Gas ADC │  │ Api (Flame│  │  Kipas / Pompa    │  │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘  │  Buzzer / LED     │  │
│       └─────────────┴───────────────┘        └───────────────────┘  │
│                        │                              ▲              │
│               calcStateLocal()                 applyCommand()        │
│                        │                              │              │
│         ┌──────────────▼──────────────────────────────┤              │
│         │      Hybrid Logic + Pump Safety              │              │
│         │   (lokal-first untuk state ≥ 5 → pompa ON)  │              │
│         └────────┬────────────────────────────────────┘              │
│                  │ MQTT Publish                                       │
│                  │ (smartkitchen/DAPUR01/sensor)                     │
└──────────────────┼────────────────────────────────────────────────── ┘
                   │
                   ▼  EMQX Cloud Broker (TLS 8883)
┌──────────────────┼───────────────────────────────────────────────────┐
│                  │ MQTT Subscribe                       Backend VPS   │
│    ┌─────────────▼──────────────────────────────────┐                │
│    │             app.js (Express)                    │                │
│    │  /api/v1/ingest ─────────────────────────────► │                │
│    │  /api/sensor   (alias)                          │                │
│    │  /api/v1/devices (read + control)               │                │
│    └──────┬────────────┬──────────────┬──────────────┘                │
│           │            │              │                                │
│    ┌──────▼─────┐  ┌───▼────┐  ┌──────▼───────┐                      │
│    │stateEngine │  │alertSvc│  │controlService│                      │
│    │calcState() │  │episode │  │applyControl()│                      │
│    │getRisiko() │  │lifecycle│  │safety rules  │                      │
│    └──────┬─────┘  └───┬────┘  └──────────────┘                      │
│           │            │                                              │
│    ┌──────▼────────────▼──────────────────────┐                      │
│    │            MySQL Database                 │                      │
│    │  devices / sensor_logs / alert_logs /     │                      │
│    │  device_control / v_status_terbaru        │                      │
│    └──────────────────────────────────────────┘                      │
│           │                                                           │
│    ┌──────▼─────────────────────────────┐                            │
│    │  Background Jobs (setInterval)     │                            │
│    │  - offlineWatcher (deteksi offline)│                            │
│    │  - manualRevert (auto revert cmd)  │                            │
│    └────────────────────────────────────┘                            │
└───────────────────────────────────────────────────────────────────── ┘
                   │
                   │ MQTT Publish (command)
                   ▼
         smartkitchen/DAPUR01/command  →  ESP32 terima & eksekusi
```

---

## 🔄 Alur Data & Cara Kerja

### 1. Pembacaan Sensor (ESP32)
Setiap **5 detik**, ESP32 membaca:
- **DHT22** → Suhu (°C) dan Kelembapan (%RH), dibaca tiap minimal 2 detik
- **MQ-2** → Gas/asap via ADC 12-bit (nilai 0–4095)
- **KY-026** → Sensor api (flame), digital LOW = api terdeteksi

### 2. State Lokal (Hybrid Logic)
ESP32 menghitung state secara **lokal** sebelum mengirim ke server:
```
kode = 1 + (api×4) + (asap×2) + (panas×1)
```
Jika `kode >= 5` (kondisi BAHAYA), **pompa langsung dinyalakan tanpa menunggu server** — ini adalah fitur **local-first safety** agar respons tidak tergantung latensi jaringan.

### 3. Pengiriman Data ke Server
ESP32 mengirim data via dua jalur (dengan prioritas):

| Prioritas | Protokol | Kondisi |
|---|---|---|
| **1 (utama)** | MQTT over TLS (port 8883) ke EMQX Cloud | MQTT tersambung |
| **2 (fallback)** | HTTP POST ke VPS `103.181.182.36:3000` | MQTT gagal/putus |

**Payload MQTT/HTTP yang dikirim:**
```json
{
  "id_device": "DAPUR01",
  "suhu": 41.2,
  "rh": 55.0,
  "mq2_adc": 420,
  "api": 0,
  "kipas": 0,
  "pompa": 0,
  "ts": 1234567890
}
```

### 4. Pemrosesan di Backend
Saat data masuk ke `/api/v1/ingest` atau `/api/sensor`:

```
1. deviceAuth      → Verifikasi X-API-Key (SHA-256 hash vs DB)
2. ingestSchema    → Validasi body dengan Zod
3. calcState()     → Hitung kode_state 1-8
4. getRisiko()     → Tentukan AMAN / WASPADA / BAHAYA
5. controlRepo     → Baca perintah manual dari device_control
6. applyControl()  → Merge auto + manual override + safety rules
7. Transaction DB:
   - sensorRepo.insert()   → Simpan ke sensor_logs
   - deviceRepo.setOnline() → Update terakhir_terlihat + status ONLINE
   - handleAlert()         → Kelola episode alert (buka/eskalasi/tutup)
8. Telegram        → Kirim notif saat transisi ke/dari BAHAYA
9. MQTT Publish    → Publish state ke smartkitchen/{id}/sensor (real-time)
10. Response       → Kirim perintah aktuator kembali ke ESP32
```

### 5. Respons ke ESP32
Backend mengembalikan perintah aktuator:
```json
{
  "ok": true,
  "state": 4,
  "tingkat_risiko": "WASPADA",
  "kipas": "ON",
  "pompa": "OFF",
  "buzzer": "BERDENYUT",
  "led": "MERAH_KEDIP",
  "interval": 5
}
```

### 6. Kontrol Manual dari Dashboard
Admin dapat mengirim perintah override via `PUT /api/v1/devices/:id/control`:
- Backend menyimpan perintah ke tabel `device_control`
- Backend mem-publish command ke MQTT topic `smartkitchen/{id}/command`
- ESP32 menerima command dan menerapkan ke aktuator

---

## ⚙️ State Engine & Logika Risiko

### Formula State
```
kode_state = 1 + (api × 4) + (asap × 2) + (panas × 1)
```
- **api** = 1 jika sensor KY-026 mendeteksi api
- **asap** = 1 jika `mq2_adc > AMBANG_ASAP` (default: 1000)
- **panas** = 1 jika `suhu > AMBANG_SUHU` (default: 40°C)

### Tabel State Lengkap

| `kode_state` | Kondisi | Risiko | Kipas | Pompa | Buzzer | LED |
|:---:|---|:---:|:---:|:---:|:---:|:---:|
| **1** | Normal | 🟢 AMAN | OFF | OFF | DIAM | HIJAU |
| **2** | Panas saja | 🟡 WASPADA | ON | OFF | BERDENYUT | MERAH_KEDIP |
| **3** | Asap saja | 🟡 WASPADA | ON | OFF | BERDENYUT | MERAH_KEDIP |
| **4** | Panas + Asap (pra-kebakaran) | 🟡 WASPADA | ON | OFF | BERDENYUT | MERAH_KEDIP |
| **5** | Api saja | 🔴 BAHAYA | OFF | ON | KONTINU | MERAH_KEDIP |
| **6** | Api + Panas | 🔴 BAHAYA | OFF | ON | KONTINU | MERAH_KEDIP |
| **7** | Api + Asap | 🔴 BAHAYA | OFF | ON | KONTINU | MERAH_KEDIP |
| **8** | Api + Asap + Panas (kebakaran penuh) | 🔴 BAHAYA | OFF | ON | KONTINU | MERAH_TETAP |

> **Catatan penting:** Pada state 5–8 (BAHAYA), kipas dimatikan paksa agar tidak menyuplai oksigen ke api. Buzzer tidak bisa dibisukan pada kondisi BAHAYA.

### Safety Rules (applyControl)
```
1. state >= 5  → kipas PAKSA OFF (tidak bisa dioverride manual)
2. state >= 5  → buzzer MUTE diblokir, tetap KONTINU
3. pompa manual ON → auto-revert ke AUTO setelah 10 detik
4. semua perintah manual → auto-revert ke AUTO setelah 60 detik
```

---

## ✨ Fitur Lengkap

### 🛡️ Deteksi & Respons Otomatis
- Deteksi multi-parameter: suhu, gas/asap, dan api secara bersamaan
- State engine 8 level dengan aksi aktuator yang dipetakan
- **Hybrid local-first**: ESP32 mengaktifkan pompa secara lokal saat bahaya tanpa tunggu server
- Safety pump: pompa dibatasi ON maksimal 10 detik berturut-turut, lalu jeda paksa
- Fallback otomatis: jika MQTT putus → HTTP POST; jika HTTP gagal → mode offline lokal

### 📊 Monitoring Real-time
- Dashboard web (HTML/JS) served langsung dari backend
- Data sensor terbaru via endpoint `/api/v1/devices/:id/status` (view `v_status_terbaru`)
- History pembacaan sensor dengan filter waktu dan limit
- Status perangkat ONLINE/OFFLINE real-time

### 🔔 Sistem Alert
- Alert episode lifecycle: AKTIF → SELESAI
- Alert baru dibuka saat `kode >= 2`
- Eskalasi `state_puncak` jika kondisi memburuk
- Alert ditutup hanya setelah **3 pembacaan berturut-turut** dengan `kode = 1` (AMAN)
- Notifikasi Telegram: kirim ke grup/chat saat transisi ke BAHAYA dan saat kembali AMAN
- De-duplikasi alert: Telegram hanya dikirim saat ada transisi state (tidak spam)

### 🎛️ Kontrol Manual
- Override kipas, pompa, dan buzzer dari dashboard
- Perintah dikirim real-time via MQTT ke ESP32
- Auto-revert: semua perintah manual kembali ke AUTO setelah 60 detik
- Blokir perintah ke device OFFLINE (HTTP 409)
- Safety rules tetap berlaku meski kontrol manual

### 🔐 Keamanan
- **Device auth**: X-API-Key di-hash SHA-256 sebelum disimpan di DB, verifikasi setiap request
- **Admin auth**: Bearer Token atau X-API-Key untuk endpoint dashboard/admin
- Rate limiting: max 120 request/menit per IP untuk endpoint ingest
- Helmet.js untuk security headers HTTP
- Body size limit 16KB untuk mencegah payload besar
- Validasi input ketat dengan Zod schema

### 📡 MQTT Real-time
- Transport MQTT over TLS (port 8883) ke EMQX Cloud
- Birth message saat ESP32 connect
- Last Will & Testament (LWT) untuk deteksi disconnect ESP32
- Server publish state ke `smartkitchen/{id}/sensor` untuk dashboard real-time
- Server publish command ke `smartkitchen/{id}/command` untuk kontrol ESP32

---

## 📁 Struktur Folder

```
smart-kitchen-backend/
│
├── 📄 .env.example              # Template semua environment variables
├── 📄 .gitignore
├── 📄 package.json              # Dependencies & npm scripts
├── 📄 ecosystem.config.js       # Konfigurasi PM2 (production process manager)
│
├── 📁 dashboard/                # Frontend monitoring (static, served oleh Express)
│   ├── index.html               # Halaman utama dashboard
│   ├── README.md
│   └── assets/
│       ├── css/
│       │   └── style.css        # Styling dashboard
│       ├── js/
│       │   ├── api.js           # HTTP request ke backend API
│       │   ├── charts.js        # Render grafik sensor (Chart.js)
│       │   ├── config.js        # Konfigurasi URL & setting frontend
│       │   ├── control.js       # Logika kontrol aktuator dari UI
│       │   ├── main.js          # Entry point, inisialisasi dashboard
│       │   ├── mock.js          # Data dummy untuk development/demo
│       │   ├── state.js         # State management UI
│       │   └── ui.js            # Manipulasi DOM & update tampilan
│       └── vendor/
│           └── DOWNLOAD_CHARTJS.txt
│
├── 📁 docs/
│   └── api.md                   # Dokumentasi lengkap REST API
│
├── 📁 firmware/                 # Kode ESP32 (Arduino IDE)
│   └── esp32_main/
│       ├── esp32_main.ino       # Sketch utama: sensor, MQTT, HTTP, aktuator
│       └── config.h             # Konfigurasi pin, WiFi, threshold, timing
│
├── 📁 sql/                      # Script database MySQL
│   ├── smart_kitchen.sql        # DDL schema utama + seed data
│   └── patch_opsi_a.sql         # Patch/migrasi tambahan
│
├── 📁 src/                      # Source code backend Node.js
│   ├── app.js                   # Setup Express: middleware, routes, static
│   ├── server.js                # Entry point: listen port, start jobs
│   │
│   ├── config/
│   │   ├── db.js                # MySQL connection pool (mysql2)
│   │   └── env.js               # Load & validasi env vars, fail-fast
│   │
│   ├── jobs/                    # Background tasks (setInterval)
│   │   ├── offlineWatcher.js    # Tandai device OFFLINE jika lama tidak kirim data
│   │   └── manualRevert.js      # Auto-revert perintah manual ke AUTO
│   │
│   ├── middlewares/
│   │   ├── adminAuth.js         # Verifikasi Bearer token / X-API-Key admin
│   │   ├── deviceAuth.js        # Verifikasi X-API-Key device (SHA-256 vs DB)
│   │   └── errorHandler.js      # Global error handler Express
│   │
│   ├── repositories/            # Layer akses database (SQL queries)
│   │   ├── alertRepo.js         # Query tabel alert_logs
│   │   ├── controlRepo.js       # Query tabel device_control
│   │   ├── deviceRepo.js        # Query tabel devices
│   │   └── sensorRepo.js        # Query tabel sensor_logs
│   │
│   ├── routes/                  # Definisi endpoint REST API
│   │   ├── ingest.routes.js     # POST /api/v1/ingest (terima data ESP32 + MQTT + Telegram)
│   │   ├── sensor.routes.js     # POST /api/sensor (alias ingest, validasi strict)
│   │   ├── read.routes.js       # GET devices, status, readings, alerts
│   │   └── control.routes.js    # GET/PUT device control
│   │
│   ├── services/                # Business logic
│   │   ├── stateEngine.js       # calcState(), getRisiko(), getAutoAction()
│   │   ├── controlService.js    # applyControl() — merge auto + manual + safety
│   │   ├── alertService.js      # handleAlert() — episode lifecycle
│   │   ├── mqttService.js       # Publish sensor state & command ke EMQX
│   │   └── telegramService.js   # Kirim notifikasi ke Telegram Bot
│   │
│   ├── utils/
│   │   └── logger.js            # Utility logging (console wrapper)
│   │
│   └── validators/
│       └── schemas.js           # Zod schemas: ingestSchema, controlSchema
│
└── 📁 tests/
    └── stateEngine.test.js      # Unit test Node.js built-in test runner
```

---

## 🗄️ Skema Database

Database: **MySQL 8.0 / MariaDB**, nama database: `smart_kitchen`

### Tabel `devices`
> Data induk semua perangkat ESP32 yang terdaftar.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id_device` | VARCHAR(20) PK | ID unik perangkat, e.g. `DAPUR01` |
| `lokasi` | VARCHAR(100) | Deskripsi lokasi pemasangan |
| `status_perangkat` | ENUM('ONLINE','OFFLINE') | Status koneksi saat ini |
| `tanggal_pasang` | DATE | Tanggal pemasangan perangkat |
| `terakhir_terlihat` | DATETIME NULL | Timestamp terakhir data diterima |
| `api_key_hash` | VARCHAR(64) | SHA-256 hash dari API key device |

---

### Tabel `sensor_logs`
> Riwayat seluruh pembacaan sensor — satu baris per kiriman data ESP32.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id_log` | BIGINT PK AUTO_INCREMENT | ID unik pembacaan |
| `id_device` | VARCHAR(20) FK | Referensi ke `devices` |
| `waktu_rekam` | DATETIME | Waktu pembacaan (timezone +07:00) |
| `suhu_celcius` | DECIMAL(4,1) NULL | Suhu dalam °C (null jika DHT gagal) |
| `kelembapan_rh` | DECIMAL(4,1) NULL | Kelembapan relatif (%) |
| `mq2_adc` | SMALLINT UNSIGNED NULL | Nilai ADC sensor gas MQ-2 (0–4095) |
| `status_api` | ENUM('TIDAK_ADA','TERDETEKSI') | Status deteksi api |
| `kode_state` | TINYINT UNSIGNED | Kode state 1–8 |
| `tingkat_risiko` | ENUM('AMAN','WASPADA','BAHAYA') | Tingkat risiko |
| `status_kipas` | ENUM('OFF','ON') | Status kipas saat itu |
| `status_pompa` | ENUM('OFF','ON') | Status pompa saat itu |
| `status_buzzer` | ENUM('DIAM','BERDENYUT','KONTINU') | Status buzzer saat itu |
| `sumber_kontrol` | ENUM('OTOMATIS','MANUAL_APP') | Apakah dari auto atau kontrol manual |

**Index:** `idx_sl_dev_waktu (id_device, waktu_rekam)`

---

### Tabel `alert_logs`
> Episode peringatan — satu baris per kejadian berbahaya.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id_alert` | BIGINT PK AUTO_INCREMENT | ID unik episode alert |
| `id_device` | VARCHAR(20) FK | Referensi ke `devices` |
| `id_log_pemicu` | BIGINT FK NULL | Referensi sensor_log yang memicu alert |
| `state_puncak` | TINYINT UNSIGNED | Kode state tertinggi selama episode |
| `tingkat_risiko` | ENUM('WASPADA','BAHAYA') | Tingkat risiko tertinggi |
| `status_alert` | ENUM('AKTIF','SELESAI') | Status episode saat ini |
| `waktu_mulai` | DATETIME | Kapan alert mulai terbuka |
| `waktu_selesai` | DATETIME NULL | Kapan alert dinyatakan selesai |

**Index:** `idx_al_dev_mulai (id_device, waktu_mulai)`

---

### Tabel `device_control`
> Perintah kontrol aktif untuk setiap perangkat — 1 baris per device.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id_device` | VARCHAR(20) PK FK | Referensi ke `devices` |
| `cmd_kipas` | ENUM('AUTO','ON','OFF') | Perintah kipas (AUTO = ikuti state engine) |
| `cmd_pompa` | ENUM('AUTO','ON','OFF') | Perintah pompa |
| `cmd_buzzer` | ENUM('AUTO','MUTE','ON') | Perintah buzzer (MUTE = bisukan) |
| `sumber_kontrol` | ENUM('OTOMATIS','MANUAL_APP') | Sumber terakhir perubahan |
| `terakhir_diubah` | TIMESTAMP | Auto-update saat ada perubahan |

---

### View `v_status_terbaru`
> View untuk dashboard — menampilkan kondisi terbaru setiap perangkat.

Menggabungkan data dari `devices` dengan baris terakhir `sensor_logs` (berdasarkan `MAX(id_log)`).

**Kolom yang tersedia:** `id_device`, `lokasi`, `status_perangkat`, `waktu_rekam`, `suhu_celcius`, `kelembapan_rh`, `mq2_adc`, `status_api`, `kode_state`, `tingkat_risiko`, `status_kipas`, `status_pompa`, `status_buzzer`

---

## 📡 API Reference

**Base URL (dev):** `http://103.181.182.36:3000`

### Endpoint Ringkasan

| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| GET | `/health` | — | Health check server + DB |
| POST | `/api/v1/ingest` | X-API-Key | Ingest data sensor dari ESP32 |
| POST | `/api/sensor` | X-API-Key | Alias ingest (validasi lebih strict) |
| GET | `/api/v1/devices` | Bearer | List semua perangkat |
| GET | `/api/v1/devices/:id/status` | Bearer | Status terbaru satu perangkat |
| GET | `/api/v1/devices/:id/readings` | Bearer | History pembacaan sensor |
| GET | `/api/v1/devices/:id/alerts` | Bearer | Riwayat episode alert |
| GET | `/api/v1/devices/:id/control` | Bearer | Baca perintah kontrol aktif |
| PUT | `/api/v1/devices/:id/control` | Bearer | Kirim perintah kontrol manual |

---

### `POST /api/v1/ingest`

**Request body:**
```json
{
  "id_device": "DAPUR01",
  "suhu": 41.2,
  "rh": 55.0,
  "mq2_adc": 420,
  "api": 0
}
```

**Response 200:**
```json
{
  "ok": true,
  "state": 2,
  "tingkat_risiko": "WASPADA",
  "kipas": "ON",
  "pompa": "OFF",
  "buzzer": "BERDENYUT",
  "led": "MERAH_KEDIP",
  "interval": 5
}
```

---

### `PUT /api/v1/devices/:id/control`

**Request body** (minimal satu field):
```json
{ "kipas": "ON", "pompa": "AUTO", "buzzer": "MUTE" }
```

| Field | Nilai yang diterima |
|---|---|
| `kipas` | `AUTO` \| `ON` \| `OFF` |
| `pompa` | `AUTO` \| `ON` \| `OFF` |
| `buzzer` | `AUTO` \| `MUTE` \| `ON` |

> Perintah ke device OFFLINE akan ditolak dengan HTTP **409 DEVICE_OFFLINE**.

---

### Error Codes

| HTTP | Code | Kapan terjadi |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body JSON tidak valid / field salah |
| 401 | `UNAUTHORIZED` | API key / token salah atau tidak ada |
| 404 | `DEVICE_NOT_FOUND` | `id_device` tidak ada di database |
| 409 | `DEVICE_OFFLINE` | Mencoba kontrol device yang sedang offline |
| 429 | `RATE_LIMITED` | Lebih dari 120 request/menit per IP |
| 500 | `INTERNAL_ERROR` | Error server (detail di PM2 log) |

---

## 🔐 Autentikasi

### Device Auth (ESP32)
Dipakai untuk endpoint ingest (`/api/v1/ingest`, `/api/sensor`).

```
Header: X-API-Key: <api_key_device>
```

Saat menerima request:
1. Backend membaca raw key dari header `X-API-Key`
2. Hitung SHA-256 dari raw key: `SHA256("<api_key_device>")`
3. Bandingkan dengan kolom `api_key_hash` di tabel `devices`
4. Jika cocok → `req.device` diisi, lanjut ke handler
5. Jika tidak cocok → HTTP 401

### Admin Auth (Dashboard)
Dipakai untuk semua endpoint read dan control.

```
Header: Authorization: Bearer <ADMIN_TOKEN>
# ATAU
Header: X-API-Key: <ADMIN_TOKEN>
```

Token dibandingkan langsung dengan env var `ADMIN_TOKEN`.

---

## ⏱️ Background Jobs

### offlineWatcher
**File:** `src/jobs/offlineWatcher.js`

Berjalan setiap `INTERVAL_DETIK` detik. Menandai device sebagai `OFFLINE` apabila `terakhir_terlihat` sudah lebih dari `INTERVAL_DETIK × OFFLINE_FAKTOR` detik yang lalu.

```
Default: threshold = 5 detik × 3 = 15 detik tidak ada data → OFFLINE
```

### manualRevert
**File:** `src/jobs/manualRevert.js`

Berjalan setiap `INTERVAL_DETIK` detik. Memiliki dua logika:

| Job | Kondisi | Aksi |
|---|---|---|
| Revert Pompa | Pompa manual ON sudah > `POMPA_MANUAL_MAX_DETIK` (default: 10 detik) | Reset `cmd_pompa = AUTO` |
| Revert Semua | Semua perintah manual sudah > `MANUAL_REVERT_DETIK` (default: 60 detik) | Reset semua ke `AUTO` |

---

## 🤖 Firmware ESP32

**File:** `firmware/esp32_main/esp32_main.ino` + `config.h`

### Hardware & Pin Mapping

| Sensor/Aktuator | Pin (Wokwi) | Pin (Hardware Fisik) | Keterangan |
|---|:---:|:---:|---|
| DHT22 (data) | 22 | 4 | Suhu & Kelembapan |
| MQ-2 (ADC) | 15 | 35 (ADC1 ch7) | Gas & Asap |
| KY-026 Flame | 16 | 5 | Sensor Api |
| LED Hijau | 19 | 18 | Indikator AMAN |
| LED Merah | 21 | 19 | Indikator BAHAYA |
| Buzzer | 23 | 21 | Alarm |
| Kipas (relay) | 2 | 22 | MOSFET/relay gate |
| Pompa (relay) | 17 | 23 | MOSFET/relay gate |

### MQTT Topics

| Topic | Arah | Keterangan |
|---|---|---|
| `smartkitchen/DAPUR01/sensor` | ESP32 → Server | Data sensor setiap 5 detik |
| `smartkitchen/DAPUR01/command` | Server → ESP32 | Perintah aktuator dari backend/dashboard |
| `smartkitchen/DAPUR01/lwt` | ESP32 → Broker | Last Will & Testament + Birth message |
| `smartkitchen/server/status` | Server → Broker | Status server (opsional) |

### Pola Buzzer & LED

| Mode | Buzzer | LED Merah |
|---|---|---|
| DIAM | Mati | — |
| BERDENYUT | Toggle 500ms | Kedip 400ms |
| KONTINU | Nyala terus | Nyala terus (atau kedip untuk state 5-7) |

### Profile Simulasi vs Hardware
Ganti `PROFILE_WOKWI` di `config.h`:
- `1` → Mode simulasi Wokwi (pin berbeda, skip warmup MQ-2)
- `0` → Hardware fisik nyata

---

## 🛠️ Instalasi & Setup

### Prerequisites
- Node.js **>= 22.0.0**
- MySQL 8.0 atau MariaDB
- npm

### 1. Clone & Install
```bash
git clone <repo-url>
cd smart-kitchen-backend
npm install
```

### 2. Setup Database
```bash
# Buat database
mysql -u root -p -e "CREATE DATABASE smart_kitchen CHARACTER SET utf8mb4;"

# Import schema + seed data
mysql -u root -p smart_kitchen < sql/smart_kitchen.sql
```

### 3. Konfigurasi Environment
```bash
cp .env.example .env
# Edit .env sesuai konfigurasi lokal Anda
```

### 4. Jalankan Server

**Development (auto-restart):**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

### 5. Test Koneksi
```bash
curl http://localhost:3000/health
# → { "ok": true, "ts": "..." }
```

### 6. Test Ingest Data
```bash
curl -X POST http://localhost:3000/api/v1/ingest \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <api_key_device>" \
  -d '{"id_device":"DAPUR01","suhu":30,"rh":55,"mq2_adc":100,"api":0}'
```

### 7. Upload Firmware ke ESP32
1. Buka `firmware/esp32_main/esp32_main.ino` di Arduino IDE
2. Install library: `PubSubClient`, `ArduinoJson`, `DHT sensor library`
3. Sesuaikan `config.h` (WiFi SSID/Pass, SERVER_URL, API_KEY)
4. Set `PROFILE_WOKWI 0` untuk hardware fisik
5. Upload ke ESP32

---

## 🔧 Environment Variables

| Variable | Default | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port server Express |
| `DB_HOST` | — | Host MySQL (**wajib**) |
| `DB_PORT` | `3306` | Port MySQL |
| `DB_USER` | — | Username MySQL (**wajib**) |
| `DB_PASS` | — | Password MySQL (**wajib**) |
| `DB_NAME` | — | Nama database (**wajib**) |
| `ADMIN_TOKEN` | — | Token admin dashboard (**wajib**) |
| `AMBANG_ASAP` | `1000` | Threshold ADC MQ-2 untuk deteksi asap |
| `AMBANG_SUHU` | `40` | Threshold suhu (°C) untuk deteksi panas |
| `INTERVAL_DETIK` | `5` | Interval kirim data ESP32 (detik) |
| `OFFLINE_FAKTOR` | `3` | Multiplier untuk hitung timeout offline |
| `MANUAL_REVERT_DETIK` | `60` | Waktu auto-revert perintah manual (detik) |
| `POMPA_MANUAL_MAX_DETIK` | `10` | Batas maksimal pompa manual ON (detik) |
| `MQTT_URL` | — | URL broker EMQX Cloud |
| `MQTT_USER` | — | Username MQTT |
| `MQTT_PASS` | — | Password MQTT |
| `TELEGRAM_ENABLED` | `true` | Aktifkan notifikasi Telegram |
| `TELEGRAM_BOT_TOKEN` | — | Token Telegram Bot |
| `TELEGRAM_CHAT_ID` | — | Chat ID tujuan notifikasi |

> **Penting:** `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`, dan `ADMIN_TOKEN` adalah **wajib**. Server akan berhenti (`process.exit(1)`) jika salah satu tidak di-set.

---

## 🚀 Deployment dengan PM2

```bash
# Install PM2 global
npm install -g pm2

# Jalankan dengan konfigurasi ecosystem
pm2 start ecosystem.config.js

# Lihat status
pm2 status

# Lihat log
pm2 logs smart-kitchen

# Auto-start saat reboot
pm2 save
pm2 startup
```

**Konfigurasi PM2** (`ecosystem.config.js`):
- Instances: 1
- Auto-restart: aktif
- Max memory: 200MB sebelum restart
- Log error: `logs/err.log`
- Log output: `logs/out.log`
- Format waktu log: `YYYY-MM-DD HH:mm:ss`

---

## 🧰 Tech Stack

### Backend
| Paket | Versi | Fungsi |
|---|---|---|
| `express` | ^4.19 | HTTP framework |
| `mysql2` | ^3.10 | MySQL driver (async/await) |
| `helmet` | ^7.1 | Security headers |
| `express-rate-limit` | ^7.3 | Rate limiting |
| `zod` | ^3.23 | Schema validation |
| `mqtt` | ^5.16 | MQTT client ke EMQX Cloud |
| `node-cron` | ^3.0 | Background job scheduler |
| `node-fetch` | ^2.7 | HTTP client (Telegram API) |
| `dotenv` | ^16.4 | Environment variables loader |

### Firmware
| Library | Fungsi |
|---|---|
| `PubSubClient` | MQTT client untuk ESP32 |
| `ArduinoJson` | Serialize/deserialize JSON |
| `DHT sensor library` | Baca sensor DHT22 |
| `WiFiClientSecure` | TLS/SSL connection |
| `HTTPClient` | HTTP POST fallback |

### Infrastructure
| Komponen | Detail |
|---|---|
| **VPS** | IP `103.181.182.36`, port `3000` |
| **MQTT Broker** | EMQX Cloud, Asia Southeast 1, TLS port `8883` |
| **Database** | MySQL 8.0 / MariaDB |
| **Process Manager** | PM2 |
| **Runtime** | Node.js >= 22.0.0 |

---

## 📝 npm Scripts

```bash
npm start       # Jalankan production server
npm run dev     # Development dengan hot-reload (node --watch)
npm test        # Jalankan unit test (node --test)
```

---

## 🧪 Testing

```bash
npm test
# Menjalankan tests/stateEngine.test.js menggunakan built-in Node.js test runner
```

Unit test mencakup logika `calcState()`, `getRisiko()`, dan `getAutoAction()` di `stateEngine`.

---

*Smart Kitchen Early Fire Response System — Semester 5 IoT Project*
