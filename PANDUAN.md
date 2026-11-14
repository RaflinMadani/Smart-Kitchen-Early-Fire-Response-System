# 🍳 Smart Kitchen — Panduan Menjalankan Sistem

> Dokumen ini menjelaskan **langkah demi langkah** cara menjalankan sistem Smart Kitchen
> dari **nol** — baik di **laptop lokal** (untuk pengembangan & simulasi Wokwi)
> maupun di **VPS** (untuk produksi dengan hardware ESP32 fisik).

---

## Daftar Isi

1. [Prasyarat](#1-prasyarat)
2. [Struktur Proyek](#2-struktur-proyek)
3. [Persiapan Awal (Satu Kali)](#3-persiapan-awal-satu-kali)
   - [3a. Database MySQL](#3a-database-mysql)
   - [3b. Akun EMQX Cloud](#3b-akun-emqx-cloud)
   - [3c. Bot Telegram (Opsional)](#3c-bot-telegram-opsional)
   - [3d. Konfigurasi .env](#3d-konfigurasi-env)
4. [Menjalankan Lokal (Laptop / PC)](#4-menjalankan-lokal-laptop--pc)
5. [Menjalankan di VPS](#5-menjalankan-di-vps)
6. [Simulasi Wokwi (Tanpa Hardware)](#6-simulasi-wokwi-tanpa-hardware)
7. [Flash Firmware ke ESP32 Fisik](#7-flash-firmware-ke-esp32-fisik)
8. [Verifikasi Sistem Berjalan](#8-verifikasi-sistem-berjalan)
9. [Troubleshooting Umum](#9-troubleshooting-umum)
10. [Referensi Port & URL](#10-referensi-port--url)

---

## 1. Prasyarat

### Untuk Backend (Lokal maupun VPS)

| Komponen | Versi Minimum | Cara Cek |
|---|---|---|
| **Node.js** | v22.0.0 | `node -v` |
| **npm** | v10+ | `npm -v` |
| **MySQL** | 8.0 / MariaDB 10.6 | `mysql --version` |

### Untuk Firmware ESP32

| Komponen | Keterangan |
|---|---|
| **Arduino IDE** | v2.x (disarankan) atau PlatformIO |
| **Library `PubSubClient`** | by Nick O'Leary — install via Library Manager |
| **Library `ArduinoJson`** | v7.x — install via Library Manager |
| **Library `DHT sensor library`** | by Adafruit — install via Library Manager |
| **Board ESP32** | Install via Board Manager: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json` |

---

## 2. Struktur Proyek

```
smart-kitchen-backend/
├── src/                    ← Kode backend Node.js
│   ├── server.js           ← Entry point
│   ├── app.js              ← Express + routing
│   ├── config/
│   │   ├── env.js          ← Baca .env
│   │   └── db.js           ← Pool MySQL
│   ├── routes/             ← HTTP API endpoints
│   ├── services/
│   │   ├── mqttService.js  ← MQTT EMQX Cloud
│   │   └── telegramService.js ← Notifikasi Telegram
│   └── jobs/               ← Cron: offline watcher, manual revert
├── dashboard/              ← Web dashboard (HTML + JS statis)
│   └── assets/js/
│       └── config.js       ← Konfigurasi dashboard (DEVICE_ID, TOKEN)
├── firmware/
│   └── esp32_main/
│       ├── esp32_main.ino  ← Firmware utama
│       └── config.h        ← Konfigurasi WiFi, MQTT, pin
├── sql/
│   ├── smart_kitchen.sql   ← DDL lengkap (instalasi baru)
│   └── patch_v2.sql        ← Migrasi (jika DB lama sudah ada)
├── .env.example            ← Template konfigurasi
└── package.json
```

---

## 3. Persiapan Awal (Satu Kali)

### 3a. Database MySQL

#### Instalasi MySQL (jika belum ada)

**Windows (lokal):**
Download MySQL Community Server dari https://dev.mysql.com/downloads/mysql/ lalu instal.

**Ubuntu/Debian (VPS):**
```bash
sudo apt update
sudo apt install mysql-server -y
sudo mysql_secure_installation
```

#### Buat Database dan User

Masuk ke MySQL sebagai root:
```bash
# Windows
mysql -u root -p

# Linux / VPS
sudo mysql
```

Jalankan perintah berikut di dalam MySQL shell:
```sql
-- Buat database
CREATE DATABASE smart_kitchen CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Buat user aplikasi
CREATE USER 'sk_app'@'localhost' IDENTIFIED BY 'Smart*2026';
GRANT ALL PRIVILEGES ON smart_kitchen.* TO 'sk_app'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

#### Import Skema

**Jika ini instalasi BARU (belum pernah dipakai):**
```bash
# Windows (jalankan di Command Prompt / PowerShell)
mysql -u sk_app -p smart_kitchen < sql/smart_kitchen.sql

# Linux / VPS
mysql -u sk_app -p smart_kitchen < sql/smart_kitchen.sql
```

**Jika database LAMA sudah ada (upgrade dari versi sebelumnya):**
```bash
mysql -u sk_app -p smart_kitchen < sql/patch_v2.sql
```

#### Verifikasi Hash API Key

Perintah `patch_v2.sql` sudah menyertakan device `DAPUR01` dengan API key `Smart*2026`.
Verifikasi hash yang tersimpan cocok:

```bash
# Linux / VPS — hitung SHA-256 dari API key Anda
echo -n "Smart*2026" | sha256sum
# Hasilnya harus cocok dengan nilai di kolom api_key_hash
```

Jika Anda mengganti nilai `API_KEY` di `firmware/config.h`, hitung ulang hash-nya dan update di DB:
```sql
UPDATE devices SET api_key_hash = 'HASH_BARU' WHERE id_device = 'DAPUR01';
```

---

### 3b. Akun EMQX Cloud

MQTT broker sudah tersedia di:
- **Host:** `e751b1cd.ala.asia-southeast1.emqxsl.com`
- **Port TLS:** `8883`

**Langkah membuat kredensial:**

1. Login ke [EMQX Cloud Console](https://cloud.emqx.com)
2. Pilih deployment Anda → **Authentication** → **+ Add**
3. Buat **dua** user:

   | Username | Password | Digunakan oleh |
   |---|---|---|
   | `smart_kitchen_server` | _(password pilihan Anda)_ | Backend Node.js |
   | `smart_kitchen_esp32` | _(password pilihan Anda)_ | Firmware ESP32 |

4. Catat kedua password — akan diisi ke `.env` dan `config.h`

> ⚠️ **Penting:** Password MQTT **berbeda** dengan password database.
> Gunakan password yang kuat dan berbeda untuk tiap user.

---

### 3c. Bot Telegram (Opsional)

Jika ingin notifikasi darurat via Telegram:

1. Buka Telegram → cari **@BotFather** → kirim `/newbot`
2. Ikuti instruksi → catat **Bot Token** (format: `123456789:ABC-xxx`)
3. Tambahkan bot ke grup/channel yang Anda inginkan
4. Dapatkan **Chat ID**:
   - Untuk grup: kirim pesan ke grup, lalu buka
     `https://api.telegram.org/bot<TOKEN>/getUpdates`
   - Cari `"chat":{"id": -100xxxxxxxxxx}` — itulah Chat ID
5. Catat Token dan Chat ID untuk diisi ke `.env`

Jika tidak ingin Telegram, set `TELEGRAM_ENABLED=false` di `.env`.

---

### 3d. Konfigurasi .env

Salin file contoh dan isi nilainya:

```bash
# Di folder smart-kitchen-backend/
cp .env.example .env
```

Buka `.env` dengan editor teks dan isi:

```env
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=sk_app
DB_PASS=Smart*2026         # ← ganti jika Anda set password berbeda
DB_NAME=smart_kitchen
ADMIN_TOKEN=Smart*2026     # ← token untuk akses dashboard web

AMBANG_ASAP=1000           # Threshold gas MQ-2 (ADC 0-4095)
AMBANG_SUHU=40             # Threshold suhu (°C)
INTERVAL_DETIK=5           # Interval kirim data ESP32 (detik)
OFFLINE_FAKTOR=3           # Device dianggap offline setelah 3× interval
MANUAL_REVERT_DETIK=60     # Perintah manual kembali AUTO setelah 60 detik
POMPA_MANUAL_MAX_DETIK=10  # Pompa manual maksimal 10 detik

# MQTT EMQX Cloud
MQTT_URL=mqtts://e751b1cd.ala.asia-southeast1.emqxsl.com:8883
MQTT_USER=smart_kitchen_server    # ← user yang dibuat di EMQX
MQTT_PASS=PASSWORD_MQTT_ANDA      # ← password MQTT server

# Telegram (isi jika ingin notifikasi, atau set ENABLED=false)
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=123456789:ABC-xxx
TELEGRAM_CHAT_ID=-100xxxxxxxxxx
```

---

## 4. Menjalankan Lokal (Laptop / PC)

### Langkah 1 — Clone & Install

```bash
# Masuk ke folder proyek
cd "smart-kitchen-backend"

# Install semua dependensi Node.js
npm install
```

### Langkah 2 — Buat .env

Ikuti [Langkah 3d](#3d-konfigurasi-env) di atas.

### Langkah 3 — Import Database

```bash
mysql -u sk_app -p smart_kitchen < sql/smart_kitchen.sql
```

### Langkah 4 — Jalankan Server (Mode Development)

```bash
npm run dev
```

Output yang diharapkan:
```
[server] Smart Kitchen backend listening on 0.0.0.0:3000
[offlineWatcher] started (threshold=15s)
[manualRevert] started
[mqtt] Connecting to mqtts://e751b1cd.ala.asia-southeast1.emqxsl.com:8883 …
[mqtt] Connected to EMQX broker
```

> Jika baris MQTT menampilkan "Gagal" atau tidak ada, periksa kredensial MQTT di `.env`.
> Backend **tetap berjalan normal** menggunakan HTTP POST saja.

### Langkah 5 — Buka Dashboard

Buka browser: **http://localhost:3000**

Untuk mode simulasi (tanpa hardware/ESP32):
**http://localhost:3000?mock=1**

---

## 5. Menjalankan di VPS

### Langkah 1 — Upload Kode ke VPS

**Cara A — Git (Disarankan):**
```bash
# Di VPS
git clone https://github.com/USERNAME/REPO.git smart-kitchen-backend
cd smart-kitchen-backend
```

**Cara B — Upload Manual (SCP / FileZilla):**
Upload seluruh folder `smart-kitchen-backend` ke VPS, lalu:
```bash
cd smart-kitchen-backend
```

### Langkah 2 — Install Node.js di VPS

```bash
# Install Node.js v22 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install nodejs -y
node -v   # pastikan v22+
```

### Langkah 3 — Install MySQL di VPS

```bash
sudo apt update && sudo apt install mysql-server -y
sudo mysql_secure_installation
# Buat DB dan user (sama seperti langkah 3a)
sudo mysql < sql/smart_kitchen.sql   # belum bisa, harus buat DB dulu

# Masuk MySQL dulu
sudo mysql
```
```sql
CREATE DATABASE smart_kitchen CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'sk_app'@'localhost' IDENTIFIED BY 'Smart*2026';
GRANT ALL PRIVILEGES ON smart_kitchen.* TO 'sk_app'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```
```bash
# Import skema
mysql -u sk_app -p smart_kitchen < sql/smart_kitchen.sql
```

### Langkah 4 — Install Dependensi Node.js

```bash
npm install --omit=dev
```

### Langkah 5 — Buat .env di VPS

```bash
cp .env.example .env
nano .env   # atau: vim .env
```

Pastikan `DB_HOST=127.0.0.1` (sama server), isi MQTT dan Telegram.

### Langkah 6 — Install PM2 (Process Manager)

PM2 menjaga backend tetap berjalan walau terminal ditutup, dan auto-restart jika crash.

```bash
sudo npm install pm2 -g

# Jalankan dengan PM2
pm2 start ecosystem.config.js

# Lihat status
pm2 status

# Lihat log live
pm2 logs smart-kitchen

# Otomatis start saat VPS reboot
pm2 startup
# Jalankan perintah yang muncul dari output di atas, contoh:
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
pm2 save
```

### Langkah 7 — Buka Firewall Port 3000

```bash
# Jika menggunakan UFW
sudo ufw allow 3000/tcp
sudo ufw status

# Jika menggunakan iptables
sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
```

### Langkah 8 — Akses Dashboard

Buka browser: **http://IP_VPS_ANDA:3000**

> Contoh: `http://103.181.182.36:3000`

---

## 6. Simulasi Wokwi (Tanpa Hardware)

Wokwi adalah simulator ESP32 online. Cocok untuk testing tanpa hardware fisik.

### Cara 1 — Simulasi Dashboard Saja (Mode Mock)

Tidak perlu hardware sama sekali. Cukup buka:
```
http://localhost:3000?mock=1
```
Dashboard akan bergilir melalui semua state 1→8 otomatis setiap 3 detik.

### Cara 2 — Simulasi Firmware via Wokwi

1. Buka [wokwi.com](https://wokwi.com) → **New Project** → pilih **ESP32**
2. Salin isi `firmware/esp32_main/esp32_main.ino` ke editor Wokwi
3. Salin isi `firmware/esp32_main/config.h` ke tab baru di Wokwi

**Penting untuk Wokwi:**
- Pastikan `PROFILE_WOKWI 1` di `config.h` (sudah default)
- WiFi Wokwi menggunakan `Wokwi-GUEST` (sudah default, tidak perlu password)
- Ganti `SERVER_URL` di `config.h` dengan IP yang bisa dijangkau Wokwi:
  ```c
  // Jika backend berjalan lokal, gunakan ngrok atau IP publik
  // Jika backend sudah di VPS:
  #define SERVER_URL "http://103.181.182.36:3000/api/v1/ingest"
  ```
- MQTT over TLS mungkin tidak bekerja penuh di Wokwi — firmware akan fallback ke HTTP otomatis

4. Tambahkan komponen di Wokwi (tombol Add Component):
   - **DHT22** → GPIO 22
   - **Potentiometer** (simulasi MQ-2) → GPIO 15
   - **Button** (simulasi sensor api KY-026) → GPIO 16
   - **LED** hijau → GPIO 19, LED merah → GPIO 21
   - **Buzzer** → GPIO 23
   - **LED/Relay** kipas → GPIO 2
   - **LED/Relay** pompa → GPIO 17

5. Klik **▶ Start Simulation**

6. Monitor Serial untuk melihat log sensor dan koneksi

---

## 7. Flash Firmware ke ESP32 Fisik

### Langkah 1 — Siapkan Arduino IDE

1. Buka Arduino IDE → **File → Preferences**
2. Tambahkan URL board ESP32 di "Additional boards manager URLs":
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. **Tools → Board → Boards Manager** → cari `esp32` → Install

### Langkah 2 — Install Library

Buka **Sketch → Include Library → Manage Libraries**, install:
- `PubSubClient` by Nick O'Leary (versi 2.8+)
- `ArduinoJson` by Benoit Blanchon (versi 7.x)
- `DHT sensor library` by Adafruit
- `Adafruit Unified Sensor` by Adafruit

### Langkah 3 — Edit config.h untuk Hardware Fisik

Buka `firmware/esp32_main/config.h` dan ubah:

```c
// Baris 8: ganti ke 0 untuk hardware fisik
#define PROFILE_WOKWI 0

// Baris 21-22: isi WiFi rumah/lab Anda
#define WIFI_SSID "NAMA_WIFI_ANDA"
#define WIFI_PASS "PASSWORD_WIFI_ANDA"

// Baris 24-25: isi kredensial MQTT ESP32
#define MQTT_USER "smart_kitchen_esp32"
#define MQTT_PASS "PASSWORD_MQTT_ESP32_ANDA"

// Baris 29: pastikan URL backend sudah benar
#define SERVER_URL "http://103.181.182.36:3000/api/v1/ingest"
```

### Langkah 4 — Hubungkan dan Flash

1. Sambungkan ESP32 ke laptop via kabel USB
2. **Tools → Board** → pilih `ESP32 Dev Module`
3. **Tools → Port** → pilih COM port ESP32 Anda (Windows: COMx, Linux: /dev/ttyUSB0)
4. Klik tombol **→ Upload**
5. Buka **Serial Monitor** (Ctrl+Shift+M), baud rate 115200
6. Lihat log — pastikan muncul `[wifi] Terhubung` dan `[mqtt] Terhubung ke EMQX`

---

## 8. Verifikasi Sistem Berjalan

### Cek Backend

```bash
# Health check
curl http://localhost:3000/health
# Respons: {"ok":true,"ts":"..."}

# Cek status device (ganti token jika diubah)
curl -H "Authorization: Bearer Smart*2026" \
     http://localhost:3000/api/v1/devices/DAPUR01/status
```

### Cek MQTT

Buka EMQX Cloud Console → **Monitor** → Anda akan melihat:
- **Client `smart-kitchen-server-XXXX`** (backend) → connected
- **Client `esp32-DAPUR01-XXXXX`** (ESP32) → connected (saat ESP32 nyala)

### Cek Dashboard

| URL | Fungsi |
|---|---|
| `http://localhost:3000` | Dashboard normal (butuh ESP32 online) |
| `http://localhost:3000?mock=1` | Mode simulasi — tanpa ESP32 |
| `http://localhost:3000#riwayat` | Langsung buka tab Riwayat |
| `http://localhost:3000#kontrol` | Langsung buka tab Kontrol |

### Cek Telegram

Jika bot dan chat ID sudah benar, saat sensor mencapai state ≥ 5 (BAHAYA),
notifikasi Telegram otomatis dikirim. Anda bisa simulasikan dengan mode mock.

---

## 9. Troubleshooting Umum

### ❌ `[config/env] Missing required env var: DB_HOST`
**Penyebab:** File `.env` tidak ada atau tidak terbaca.
**Solusi:** Pastikan file `.env` ada di folder `smart-kitchen-backend/` (bukan di dalam `src/`).
```bash
ls -la .env   # harus ada
```

### ❌ `ERROR [db] MySQL pool error: connect ECONNREFUSED`
**Penyebab:** MySQL tidak berjalan atau kredensial salah.
**Solusi:**
```bash
# Linux: cek status MySQL
sudo systemctl status mysql
sudo systemctl start mysql   # jika mati

# Verifikasi koneksi
mysql -u sk_app -p -e "SELECT 1" smart_kitchen
```

### ❌ `[mqtt] Gagal (rc=-2) — fallback HTTP`
**Penyebab:** Koneksi ke EMQX gagal. Kode rc=-2 = timeout koneksi.
**Kemungkinan:**
- Port 8883 diblokir firewall/ISP
- Username/password MQTT salah
- Format MQTT_URL salah

**Solusi:** Periksa:
```bash
# Test koneksi TLS ke EMQX
openssl s_client -connect e751b1cd.ala.asia-southeast1.emqxsl.com:8883 -brief
```
Backend tetap berjalan normal via HTTP POST — MQTT adalah fitur tambahan.

### ❌ Dashboard menampilkan "Perangkat Offline" padahal ESP32 menyala
**Penyebab:** ESP32 tidak berhasil mengirim data ke backend (HTTP/MQTT gagal).
**Solusi:**
- Cek IP/URL di `config.h` → `SERVER_URL` harus bisa dijangkau dari jaringan ESP32
- Pastikan port 3000 terbuka di firewall VPS
- Lihat Serial Monitor ESP32 untuk error detail

### ❌ Tombol kontrol di dashboard abu-abu (tidak bisa diklik)
**Ini fitur, bukan bug.** Tombol dikunci otomatis saat `status_perangkat = OFFLINE`.
Tombol aktif kembali saat ESP32 mengirim data (ONLINE).

### ❌ `ESP32: [mqtt] Gagal (rc=5)` di Serial Monitor
**Penyebab:** Username/password MQTT salah (rc=5 = NOT_AUTHORIZED).
**Solusi:** Periksa `MQTT_USER` dan `MQTT_PASS` di `config.h` — harus sama persis dengan yang dibuat di EMQX Console.

---

## 10. Referensi Port & URL

| Komponen | Alamat | Keterangan |
|---|---|---|
| Backend HTTP | `http://localhost:3000` (lokal) atau `http://IP_VPS:3000` | API + Dashboard |
| Health check | `GET /health` | Cek server + DB |
| Ingest ESP32 | `POST /api/v1/ingest` | Header: `X-API-Key` |
| Status device | `GET /api/v1/devices/DAPUR01/status` | Header: `Authorization: Bearer TOKEN` |
| Kontrol | `PUT /api/v1/devices/DAPUR01/control` | Header: `Authorization: Bearer TOKEN` |
| Riwayat alert | `GET /api/v1/devices/DAPUR01/alerts` | Header: `Authorization: Bearer TOKEN` |
| MQTT Broker | `mqtts://e751b1cd.ala.asia-southeast1.emqxsl.com:8883` | TLS |
| MQTT WebSocket | `wss://e751b1cd.ala.asia-southeast1.emqxsl.com:8084` | Untuk klien browser |
| EMQX API | `https://e751b1cd.ala.asia-southeast1.emqxsl.com:8443/api/v5` | Manajemen broker |

### Topic MQTT

| Topic | Arah | Isi |
|---|---|---|
| `smartkitchen/DAPUR01/sensor` | ESP32 → Broker → Server | Data sensor JSON tiap 5 detik |
| `smartkitchen/DAPUR01/command` | Server → Broker → ESP32 | Perintah aktuator dari dashboard |
| `smartkitchen/DAPUR01/lwt` | ESP32 → Broker (retained) | Status online/offline ESP32 |
| `smartkitchen/server/status` | Server → Broker (retained) | Status online/offline backend |

---

## Urutan Checklist Memulai (Ringkasan)

```
[ ] 1. Install Node.js v22 dan MySQL 8
[ ] 2. Buat database dan user MySQL (langkah 3a)
[ ] 3. Import sql/smart_kitchen.sql
[ ] 4. Buat kredensial MQTT di EMQX Cloud (langkah 3b)
[ ] 5. Buat Bot Telegram jika diperlukan (langkah 3c)
[ ] 6. Salin .env.example → .env dan isi semua nilai
[ ] 7. npm install
[ ] 8. npm run dev  (atau pm2 start di VPS)
[ ] 9. Buka http://localhost:3000?mock=1 — pastikan dashboard muncul
[ ] 10. Edit firmware/config.h — isi WiFi + MQTT + set PROFILE_WOKWI
[ ] 11. Flash firmware ke ESP32 atau simulasikan di Wokwi
[ ] 12. Pantau Serial Monitor — pastikan WiFi dan MQTT terhubung
[ ] 13. Dashboard → indikator berubah hijau "Perangkat Online" ✅
```
