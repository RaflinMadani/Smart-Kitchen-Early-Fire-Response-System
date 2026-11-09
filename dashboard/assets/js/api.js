// ================================================================
// api.js — semua fetch ke backend lewat sini
// ================================================================
import { BASE_URL, FETCH_TIMEOUT_MS, ADMIN_TOKEN } from './config.js';

/**
 * Core fetch dengan timeout AbortController + retry-safe error.
 * Selalu mengembalikan { ok, data?, error? }.
 */
async function apiFetch(path, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  const url = BASE_URL + path;
  try {
    const res = await fetch(url, {
      ...options,
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        ...(options.headers || {}),
      },
    });
    clearTimeout(timer);
    const json = await res.json();
    if (!res.ok) {
      return { ok: false, error: json?.error?.message || `HTTP ${res.status}` };
    }
    return json; // { ok: true, data: ... }
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      return { ok: false, error: 'Timeout — server tidak merespons' };
    }
    return { ok: false, error: err.message || 'Koneksi gagal' };
  }
}

// ── Endpoint wrappers ─────────────────────────────────────────────

/** GET /api/v1/devices/:id/status  → { ok, data: v_status_terbaru row } */
export async function fetchStatus(deviceId) {
  return apiFetch(`/api/v1/devices/${deviceId}/status`);
}

/** GET /api/v1/devices/:id/readings?limit=60  → { ok, data: [] } */
export async function fetchReadings(deviceId, limit = 60) {
  return apiFetch(`/api/v1/devices/${deviceId}/readings?limit=${limit}`);
}

/** GET /api/v1/devices/:id/alerts?status=  → { ok, data: [] } */
export async function fetchAlerts(deviceId, status = '') {
  const qs = status ? `?status=${status}` : '';
  return apiFetch(`/api/v1/devices/${deviceId}/alerts${qs}`);
}

/** GET /api/v1/devices/:id/control  → { ok, data: control row } */
export async function fetchControl(deviceId) {
  return apiFetch(`/api/v1/devices/${deviceId}/control`);
}

/**
 * PUT /api/v1/devices/:id/control
 * body: { kipas?, pompa?, buzzer? }   values: AUTO|ON|OFF / AUTO|MUTE|ON
 * → { ok, data: updated control row }
 */
export async function putControl(deviceId, body) {
  return apiFetch(`/api/v1/devices/${deviceId}/control`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/** GET /api/v1/devices  → { ok, data: [] } */
export async function fetchDevices() {
  return apiFetch('/api/v1/devices');
}

/** GET /health  (no auth header needed but harmless) → { ok, ts } */
export async function fetchHealth() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(BASE_URL + '/health', { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok ? { ok: true } : { ok: false };
  } catch {
    clearTimeout(timer);
    return { ok: false };
  }
}
