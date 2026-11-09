# Smart Kitchen — Web Dashboard

Dashboard real-time untuk **Smart Kitchen Early Fire Response System**.
Dibangun dengan Vanilla JS (ES Modules) + Tailwind CSS (CDN) + Chart.js (lokal).

---

## Cara menjalankan

### Opsi A — via backend Express (disarankan, satu origin)

```bash
# Di VPS atau laptop (dengan backend sudah jalan)
pm2 restart smart-kitchen   # atau: node src/server.js

# Buka di browser
http://103.181.182.36:3000
```

Frontend disajikan oleh `express.static('dashboard')` di `src/app.js`.
Tidak ada CORS, tidak ada mixed-content.

### Opsi B — membuka file HTML langsung (hanya untuk dev lokal)

Browser modern memblokir ES Modules dari `file://`. Gunakan server kecil:

```bash
cd smart-kitchen-backend/dashboard
npx serve .          # atau: python -m http.server 8080
```

Lalu buka `http://localhost:8080`.

---

## Mode Demo (Mock)

Tambahkan `?mock=1` ke URL untuk menggunakan data palsu yang bersiklus state 1→8:

```
http://103.181.182.36:3000/?mock=1
```

Berguna saat venue tidak ada koneksi VPS atau saat presentasi tanpa perangkat fisik.

---

## Konfigurasi

Edit **`assets/js/config.js`**:

| Konstanta | Default | Keterangan |
|---|---|---|
| `BASE_URL` | `''` | URL backend (kosong = same-origin) |
| `DEVICE_ID` | `'DAPUR01'` | ID perangkat yang dipantau |
| `POLL_MS` | `3000` | Interval polling (ms) |
| `ADMIN_TOKEN` | `'TOKEN_ACAK_PANJANG'` | **Ganti** dengan nilai `ADMIN_TOKEN` di `.env` VPS |
| `AMBANG_ASAP` | `300` | Nilai ADC MQ-2 untuk penanda di grafik |

---

## Deploy ke VPS

```bash
# Dari laptop: upload folder dashboard
scp -r dashboard/ root@103.181.182.36:~/smart-kitchen-backend/

# Restart backend agar serve static terbaru
pm2 restart smart-kitchen
```

---

## Checklist uji

### 8 State (jalankan dari terminal laptop sambil pantau browser)

```bash
KEY=ISI_API_KEY
URL=http://103.181.182.36:3000/api/v1/ingest
send(){ curl -s -X POST $URL -H "Content-Type: application/json" -H "X-API-Key: $KEY" \
  -d "{\"id_device\":\"DAPUR01\",\"suhu\":$1,\"rh\":55,\"mq2_adc\":$2,\"api\":$3}"; echo; }

send 30 100 0  # State 1: NORMAL — banner tersembunyi, kartu hijau
send 45 100 0  # State 2: WASPADA — kartu kuning, kipas ON
send 30 500 0  # State 3: WASPADA — asap tinggi
send 45 500 0  # State 4: WASPADA — suhu+asap tinggi
send 30 100 1  # State 5: BAHAYA  — banner merah berkedip, pompa ON
send 45 100 1  # State 6: BAHAYA
send 30 500 1  # State 7: BAHAYA
send 45 500 1  # State 8: BAHAYA  — teks "Kebakaran Penuh"
```

### Uji offline

1. Hentikan ESP32 atau berhenti kirim selama >15 detik
2. Perangkat harus berubah jadi `OFFLINE` di tab Perangkat
3. Banner "Server tidak terjangkau" muncul jika VPS tidak bisa dijangkau browser

### Uji kontrol manual

1. Tab Kontrol → Kipas → ON → cek badge "MANUAL_APP"
2. Setelah ~60 detik → kembali AUTO otomatis (manualRevert job di backend)
3. Pompa → ON → dialog konfirmasi → hitung mundur 10 detik di UI
4. Saat state 5–8: tombol "Kipas ON" harus nonaktif, "Bisukan Alarm" nonaktif

### Uji mock

```
http://103.181.182.36:3000/?mock=1
```
Periksa badge "MODE DEMO" di header dan state berganti otomatis setiap 3 detik.

---

## ⚠️ Catatan Keamanan

> **Dashboard ini tidak memiliki halaman login.**
> Siapa pun yang mengetahui URL dapat melihat data sensor dan **mengontrol aktuator** (kipas, pompa, buzzer).
>
> Ini **disengaja untuk tujuan demo/prototipe**.
> Sebelum digunakan di lingkungan nyata, tambahkan autentikasi user (mis. JWT + halaman login)
> dan **jangan expose port 3000 ke publik** — gunakan Nginx + HTTPS + VPN.

---

## Struktur file

```
dashboard/
├── index.html                  ← satu halaman, tab routing via hash
├── assets/
│   ├── css/style.css           ← hanya override Tailwind yg tidak bisa inline
│   ├── js/
│   │   ├── config.js           ← BASE_URL, ADMIN_TOKEN, konstanta
│   │   ├── api.js              ← semua fetch() lewat sini (timeout + error)
│   │   ├── state.js            ← shared state + chart history buffer
│   │   ├── mock.js             ← data palsu ?mock=1
│   │   ├── ui.js               ← semua manipulasi DOM
│   │   ├── charts.js           ← Chart.js wrapper
│   │   ├── control.js          ← tombol kontrol manual
│   │   └── main.js             ← entry point, polling, tab routing
│   └── vendor/
│       └── chart.umd.min.js    ← Chart.js lokal (download manual — lihat bawah)
└── README.md
```

### Mengunduh Chart.js lokal

```bash
# Di folder dashboard/assets/vendor/
curl -Lo chart.umd.min.js \
  https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js
```

Atau download dari: https://www.chartjs.org/docs/latest/getting-started/installation.html
