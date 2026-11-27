# Smart Kitchen Early Fire Response System

**Tema Proyek:** Internet of Things (IoT) — Sistem Dapur Pintar dan Deteksi Kebakaran Dini

## Identitas Kelompok

**Kelompok 3 — Praktikum Internet of Things**  
**Kelas: IF-A**

| No. | Nama Anggota | NIM |
|:---:|---|:---:|
| 1 | Muhammad Wingga Tribaya | 123240008 |
| 2 | Muhammad Faaiz | 123240009 |
| 3 | Raflin Madani | 123240078 |
| 4 | Muhammad Daud Akyaz | 123240081 |

## Deskripsi Proyek

**Smart Kitchen Early Fire Response System** merupakan sistem pemantauan dan respons dini terhadap potensi kebakaran di area dapur berbasis Internet of Things (IoT). Sistem ini menggunakan ESP32 yang terhubung dengan sensor suhu dan kelembapan DHT22, sensor gas/asap MQ-2, serta sensor api KY-026 untuk memantau kondisi lingkungan dapur.

Data hasil pembacaan sensor dikirimkan ke server melalui protokol MQTT dengan EMQX Cloud sebagai broker. Backend berbasis Node.js dan Express memproses data, menentukan tingkat risiko, menyimpan riwayat pemantauan ke database MySQL, serta mengirimkan informasi kondisi perangkat ke dashboard web. Ketika terdeteksi kondisi berbahaya, sistem dapat memberikan peringatan melalui Telegram dan menjalankan aktuator secara otomatis.

## Tujuan dan Cara Kerja

Sistem dirancang untuk membantu pengguna mengetahui perubahan kondisi dapur sejak dini dan memberikan respons awal berdasarkan kombinasi pembacaan sensor. Proses kerjanya secara umum adalah:

1. **Pemantauan lingkungan** — ESP32 membaca suhu, kelembapan, kadar gas/asap, dan kondisi sensor api secara berkala.
2. **Pengiriman data** — Data sensor dikirim ke backend melalui MQTT. HTTP POST digunakan sebagai jalur alternatif ketika koneksi MQTT tidak tersedia.
3. **Analisis kondisi** — Backend mengolah data menggunakan *state engine* yang membagi kondisi menjadi delapan state berdasarkan kombinasi deteksi panas, asap, dan api.
4. **Respons otomatis** — Berdasarkan state yang dihasilkan, sistem mengatur kipas, pompa air, buzzer, serta LED indikator. Pada kondisi bahaya, ESP32 juga memiliki logika respons lokal agar aktivasi pompa tidak harus menunggu perintah dari server.
5. **Monitoring dan notifikasi** — Kondisi terkini dan riwayat sensor ditampilkan pada dashboard web. Notifikasi Telegram dikirim ketika terjadi perubahan kondisi penting, seperti masuk ke status bahaya atau kembali aman.

## Tingkat Kondisi Sistem

Sistem menggunakan tiga kategori risiko yang dibentuk dari delapan kombinasi kondisi sensor:

| Tingkat Risiko | Gambaran Kondisi | Respons Sistem |
|---|---|---|
| **AMAN** | Tidak terdeteksi panas, asap, maupun api di atas ambang yang ditentukan | Sistem berada pada kondisi siaga normal; indikator hijau menyala dan aktuator utama tidak aktif |
| **WASPADA** | Terdeteksi panas, asap, atau kombinasi keduanya tanpa deteksi api | Kipas diaktifkan, buzzer berbunyi berdenyut, dan LED merah berkedip |
| **BAHAYA** | Sensor api mendeteksi api, baik sendiri maupun bersama panas dan/atau asap | Pompa diaktifkan, buzzer menyala kontinu, dan kipas dimatikan sebagai aturan keselamatan |

## Komponen Utama

| Komponen | Teknologi/Perangkat | Fungsi |
|---|---|---|
| Mikrokontroler | ESP32 | Membaca sensor, menjalankan logika respons lokal, dan mengendalikan aktuator |
| Sensor lingkungan | DHT22 | Mengukur suhu dan kelembapan udara |
| Sensor gas/asap | MQ-2 | Mendeteksi indikasi gas dan asap |
| Sensor api | KY-026 | Mendeteksi keberadaan api |
| Aktuator dan indikator | Kipas, pompa air, buzzer, LED | Menjalankan respons otomatis dan memberikan tanda kondisi sistem |
| Komunikasi IoT | MQTT dan EMQX Cloud | Mengirimkan data sensor dan perintah antara ESP32 dan backend |
| Backend dan database | Node.js, Express, MySQL | Memproses data, menentukan tingkat risiko, serta menyimpan data pemantauan dan peringatan |
| Antarmuka pemantauan | Dashboard web (HTML dan JavaScript) | Menampilkan kondisi perangkat, data sensor, riwayat, dan kontrol manual |
| Notifikasi | Telegram Bot | Menyampaikan pemberitahuan ketika terjadi kondisi penting |

## Fitur Utama

- **Deteksi multi-sensor:** memantau suhu, kelembapan, gas/asap, dan api secara bersamaan.
- **Klasifikasi risiko:** menentukan kondisi sistem ke dalam delapan state dan tiga tingkat risiko, yaitu AMAN, WASPADA, dan BAHAYA.
- **Respons otomatis:** mengendalikan kipas, pompa air, buzzer, dan LED sesuai kondisi yang terdeteksi.
- **Respons lokal ESP32:** menjalankan tindakan keselamatan tertentu secara langsung ketika kondisi bahaya terdeteksi, sehingga tidak sepenuhnya bergantung pada koneksi server.
- **Monitoring dan riwayat:** menyediakan dashboard untuk melihat status perangkat serta data pembacaan sensor.
- **Kontrol manual:** memungkinkan operator mengatur aktuator melalui dashboard dengan tetap menerapkan aturan keselamatan sistem.
- **Notifikasi Telegram:** mengirimkan informasi ketika sistem mengalami perubahan kondisi penting.

## Teknologi yang Digunakan

- **Perangkat keras:** ESP32, DHT22, MQ-2, KY-026, kipas, pompa air, buzzer, dan LED.
- **Firmware:** Arduino Framework, PubSubClient, ArduinoJson, dan HTTPClient.
- **Komunikasi:** MQTT over TLS melalui EMQX Cloud, dengan HTTP POST sebagai jalur fallback.
- **Backend:** Node.js dan Express.
- **Database:** MySQL.
- **Dashboard:** HTML, CSS, JavaScript, dan Chart.js.
- **Notifikasi:** Telegram Bot API.

## Struktur Proyek

```text
smart-kitchen-backend/
├── dashboard/                   # Antarmuka monitoring dan kontrol berbasis web
│   ├── index.html
│   └── assets/
│       ├── css/style.css
│       ├── js/                  # api.js, charts.js, control.js, main.js, dll.
│       └── vendor/              # Chart.js (bundel lokal)
├── esp32/                       # Firmware ESP32 (PlatformIO)
│   ├── src/
│   │   ├── main.cpp             # Loop utama, logika hybrid, komunikasi MQTT/HTTP
│   │   ├── config.h             # Pin, threshold, dan konstanta waktu
│   │   └── EnvLoader.h          # Pembaca konfigurasi dari LittleFS (/.env)
│   ├── include/
│   ├── lib/
│   └── platformio.ini
├── src/                         # Backend Node.js
│   ├── server.js                # Entry point
│   ├── app.js                   # Setup Express dan middleware
│   ├── config/                  # Koneksi database dan variabel lingkungan
│   ├── routes/                  # Endpoint HTTP (ingest, sensor, control, read)
│   ├── services/                # Logika bisnis (stateEngine, mqtt, alert, telegram)
│   ├── repositories/            # Akses database (sensor, alert, device, control)
│   ├── middlewares/             # Autentikasi device/admin dan error handler
│   ├── jobs/                    # Tugas terjadwal (manualRevert, offlineWatcher)
│   ├── validators/              # Validasi skema input
│   └── utils/                   # Logger
├── sql/                         # Skrip database MySQL
│   ├── smart_kitchen.sql        # Skema awal
│   ├── patch_v2.sql
│   └── patch_opsi_a.sql
├── docs/
│   └── api.md                   # Dokumentasi REST API
├── tests/
│   └── stateEngine.test.js      # Pengujian logika state engine
├── simulator.js                 # Simulator data sensor (untuk pengujian lokal)
├── ecosystem.config.js          # Konfigurasi PM2
├── .env.example                 # Template variabel lingkungan backend
└── package.json
```

---

**Catatan:** Ambang deteksi yang digunakan sistem adalah kadar asap MQ-2 ADC > **900** (skala 0–4095) dan suhu > **40 °C**. Nilai ini dikonfigurasi di [`esp32/src/config.h`](esp32/src/config.h) untuk firmware dan diterapkan juga di backend melalui variabel lingkungan. Sistem ini merupakan prototipe proyek IoT untuk pemantauan serta respons awal terhadap indikasi kebakaran di dapur.
