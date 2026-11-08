# Smart Kitchen API Documentation

Base URL (dev): `http://103.181.182.36:3000`

---

## Authentication

| Endpoint type | Header |
|---|---|
| ESP32 ingest | `X-API-Key: <raw_key>` |
| Admin/dashboard | `Authorization: Bearer <ADMIN_TOKEN>` |

---

## Endpoints

### `GET /health`
No authentication required. Returns server and DB status.

**Response 200**
```json
{ "ok": true, "ts": "2025-01-01T07:00:00.000Z" }
```

---

### `POST /api/v1/ingest`
**Auth:** `X-API-Key`  
ESP32 sends sensor data and receives actuator commands.

**Request body**
```json
{
  "id_device": "DAPUR01",
  "suhu": 41.2,
  "rh": 55.0,
  "mq2_adc": 420,
  "api": 0,
  "kipas": 0,
  "pompa": 0
}
```

| Field | Type | Rules |
|---|---|---|
| `id_device` | string | 1–20 chars, must exist in DB |
| `suhu` | number\|null | -40 to 80, null if DHT fails |
| `rh` | number\|null | 0 to 100 |
| `mq2_adc` | integer | 0 to 4095 |
| `api` | 0 or 1 | 1 = flame detected |
| `kipas`, `pompa` | 0 or 1 (optional) | ESP32 actual status (verification only) |

**Response 200**
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

**State table**

| kode_state | Description | kipas | pompa | buzzer | led |
|---|---|---|---|---|---|
| 1 | Normal | OFF | OFF | DIAM | HIJAU |
| 2 | Thermal Warning | ON | OFF | BERDENYUT | MERAH_KEDIP |
| 3 | Gas/Smoke Warning | ON | OFF | BERDENYUT | MERAH_KEDIP |
| 4 | Pre-Combustion | ON | OFF | BERDENYUT | MERAH_KEDIP |
| 5 | Fire only | OFF | ON | KONTINU | MERAH_KEDIP |
| 6 | Fire + heat | OFF | ON | KONTINU | MERAH_KEDIP |
| 7 | Fire + smoke | OFF | ON | KONTINU | MERAH_KEDIP |
| 8 | Fire + smoke + heat | OFF | ON | KONTINU | MERAH_TETAP |

State formula: `kode = 1 + (api×4) + (asap×2) + (panas×1)`  
Asap: `mq2_adc > AMBANG_ASAP (default 300)` | Panas: `suhu > AMBANG_SUHU (default 40)`

---

### `GET /api/v1/devices/:id/status`
**Auth:** Bearer  
Returns latest reading from `v_status_terbaru`.

**Response 200**
```json
{ "ok": true, "data": { "id_device": "DAPUR01", "lokasi": "...", "kode_state": 4, ... } }
```

---

### `GET /api/v1/devices/:id/readings`
**Auth:** Bearer  
Returns sensor history.

| Query param | Default | Max |
|---|---|---|
| `from` | — | datetime |
| `to` | — | datetime |
| `limit` | 100 | 1000 |

---

### `GET /api/v1/devices/:id/alerts`
**Auth:** Bearer  
Returns alert episodes.

| Query param | Values |
|---|---|
| `status` | `AKTIF` or `SELESAI` (optional) |

---

### `GET /api/v1/devices/:id/control`
**Auth:** Bearer  
Returns current manual control settings.

---

### `PUT /api/v1/devices/:id/control`
**Auth:** Bearer  
Update manual control (partial body accepted).

**Request body** (any combination)
```json
{ "kipas": "ON", "pompa": "AUTO", "buzzer": "MUTE" }
```

| Field | Allowed values |
|---|---|
| `kipas` | `AUTO`, `ON`, `OFF` |
| `pompa` | `AUTO`, `ON`, `OFF` |
| `buzzer` | `AUTO`, `MUTE`, `ON` |

> **Safety rules enforced by backend:**  
> - `kipas` manual ON is ignored when state ≥ 5 (fire active)  
> - `buzzer MUTE` is ignored when state ≥ 5  
> - `pompa` manual ON auto-reverts to AUTO after ~10 seconds  
> - All manual commands auto-revert to AUTO after 60 seconds

---

## Error responses

```json
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "suhu: Number must be..." } }
```

| HTTP | code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid JSON or field values |
| 401 | `UNAUTHORIZED` | Missing or wrong API key / token |
| 404 | `DEVICE_NOT_FOUND` | id_device not in DB |
| 429 | `RATE_LIMITED` | > 120 requests/min per IP on /ingest |
| 500 | `INTERNAL_ERROR` | Server error (details in PM2 logs only) |

---

## Quick test commands (from laptop)

```bash
KEY=ISI_API_KEY
URL=http://103.181.182.36:3000/api/v1/ingest

# Helper function
send(){ curl -s -X POST $URL \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $KEY" \
  -d "{\"id_device\":\"DAPUR01\",\"suhu\":$1,\"rh\":55,\"mq2_adc\":$2,\"api\":$3}"; echo; }

send 30 100 0   # → state 1, AMAN
send 45 100 0   # → state 2, WASPADA
send 30 500 0   # → state 3, WASPADA
send 45 500 0   # → state 4, WASPADA
send 30 100 1   # → state 5, BAHAYA
send 45 100 1   # → state 6, BAHAYA
send 30 500 1   # → state 7, BAHAYA
send 45 500 1   # → state 8, BAHAYA

# Manual control
ADMIN=TOKEN_ACAK_PANJANG
curl -s -X PUT http://103.181.182.36:3000/api/v1/devices/DAPUR01/control \
  -H "Authorization: Bearer $ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"kipas":"ON"}'
```
