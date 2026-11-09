// ================================================================
// ui.js — semua manipulasi DOM
// Tidak ada fetch di sini; menerima data sudah-diproses.
// ================================================================
import { appState, STATE_META } from './state.js';
import { AMBANG_ASAP, ADC_MAX } from './config.js';

// ── Referensi elemen (diambil sekali) ────────────────────────────
const el = {
  // State card
  stateCard:    document.getElementById('state-card'),
  stateIcon:    document.getElementById('state-icon'),
  stateKode:    document.getElementById('state-kode'),
  stateNama:    document.getElementById('state-nama'),
  stateBadge:   document.getElementById('state-badge'),
  stateDesc:    document.getElementById('state-desc'),
  stateDevice:  document.getElementById('state-device'),
  stateLokasi:  document.getElementById('state-lokasi'),
  // Sensor
  valSuhu:      document.getElementById('val-suhu'),
  valRh:        document.getElementById('val-rh'),
  valMq2:       document.getElementById('val-mq2'),
  mq2Bar:       document.getElementById('mq2-bar'),
  valApi:       document.getElementById('val-api'),
  // Aktuator
  iconKipas:    document.getElementById('icon-kipas'),
  iconPompa:    document.getElementById('icon-pompa'),
  iconBuzzer:   document.getElementById('icon-buzzer'),
  valKipas:     document.getElementById('val-kipas'),
  valPompa:     document.getElementById('val-pompa'),
  valBuzzer:    document.getElementById('val-buzzer'),
  // Header
  connDot:      document.getElementById('conn-dot'),
  connLabel:    document.getElementById('conn-label'),
  lastUpdated:  document.getElementById('last-updated'),
  mockBadge:    document.getElementById('mock-badge'),
  // Banner
  emergencyBanner: document.getElementById('emergency-banner'),
  emergencyTitle:  document.getElementById('emergency-title'),
  emergencySub:    document.getElementById('emergency-sub'),
  serverOffBanner: document.getElementById('server-offline-banner'),
  // Control tab summary
  ctrlStateBadge: document.getElementById('ctrl-state-badge'),
  ctrlStateNama:  document.getElementById('ctrl-state-nama'),
  ctrlSumber:     document.getElementById('ctrl-sumber'),
  ctrlNotif:      document.getElementById('ctrl-notif'),
  ctrlValKipas:   document.getElementById('ctrl-val-kipas'),
  ctrlValPompa:   document.getElementById('ctrl-val-pompa'),
  ctrlValBuzzer:  document.getElementById('ctrl-val-buzzer'),
  ctrlKipaWarn:   document.getElementById('ctrl-kipas-warning'),
  ctrlMuteWarn:   document.getElementById('ctrl-mute-warning'),
  pumpCountWrap:  document.getElementById('pump-countdown-wrap'),
  pumpCountdown:  document.getElementById('pump-countdown'),
};

// ── Helpers ───────────────────────────────────────────────────────
const WARNA_CLASS = {
  normal:  { bg: 'bg-green-950', border: 'border-green-600', text: 'text-green-300', badge: 'bg-green-700 text-green-100' },
  waspada: { bg: 'bg-yellow-950', border: 'border-yellow-500', text: 'text-yellow-300', badge: 'bg-yellow-600 text-yellow-100' },
  bahaya:  { bg: 'bg-red-950',   border: 'border-red-600',   text: 'text-red-300',   badge: 'bg-red-700   text-red-100' },
};
const ALL_BG     = ['bg-green-950','bg-yellow-950','bg-red-950'];
const ALL_BORDER = ['border-green-600','border-yellow-500','border-red-600'];
const ALL_TEXT   = ['text-green-300','text-yellow-300','text-red-300'];
const ALL_BADGE  = ['bg-green-700 text-green-100','bg-yellow-600 text-yellow-100','bg-red-700 text-red-100'];

function applyWarna(warna) {
  const c = WARNA_CLASS[warna];
  el.stateCard.classList.remove(...ALL_BG);
  el.stateCard.classList.remove(...ALL_BORDER);
  el.stateCard.classList.add(c.bg, c.border);
  el.stateNama.className   = `text-xl font-semibold ${c.text}`;
  el.stateBadge.className  = `rounded-full px-3 py-1 text-sm font-bold ${c.badge}`;
}

function fmt(val, digits = 1) {
  if (val == null) return '—';
  const n = Number(val);
  return isNaN(n) ? '—' : n.toFixed(digits);
}

function fmtTime(dtStr) {
  if (!dtStr) return '—';
  try {
    const d = new Date(dtStr.replace(' ', 'T'));
    return d.toLocaleString('id-ID', { hour12: false });
  } catch { return dtStr; }
}

// ── Dashboard rendering ───────────────────────────────────────────
export function renderDashboard() {
  const s = appState;
  const meta = STATE_META[s.kodeState] || STATE_META[1];

  // State card
  el.stateIcon.textContent  = meta.icon;
  el.stateKode.textContent  = `State ${s.kodeState}`;
  el.stateNama.textContent  = meta.nama;
  el.stateBadge.textContent = meta.kategori;
  el.stateDesc.textContent  = meta.desc;
  el.stateDevice.textContent = s.idDevice;
  el.stateLokasi.textContent = s.lokasi;
  applyWarna(meta.warna);

  // Sensor cards
  el.valSuhu.textContent = fmt(s.suhu) + (s.suhu != null ? ' °C' : '');
  el.valRh.textContent   = fmt(s.rh)   + (s.rh   != null ? ' %'  : '');
  el.valMq2.textContent  = s.mq2Adc != null ? s.mq2Adc : '—';

  // MQ-2 bar
  if (s.mq2Adc != null) {
    const pct = Math.min(100, (s.mq2Adc / ADC_MAX) * 100);
    el.mq2Bar.style.width = pct + '%';
    el.mq2Bar.className = `h-full rounded-full transition-all duration-300 ${
      s.mq2Adc > AMBANG_ASAP ? 'bg-red-500' : 'bg-green-500'
    }`;
  }

  // Api
  el.valApi.textContent = s.statusApi === 'TERDETEKSI' ? '🔥 TERDETEKSI' : '✅ TIDAK ADA';
  el.valApi.className   = `text-2xl font-bold ${s.statusApi === 'TERDETEKSI' ? 'text-red-400' : 'text-green-400'}`;

  // Aktuator
  renderAktuator(el.iconKipas, el.valKipas, s.statusKipas, { ON: '🌀', OFF: '⭕' }, { ON: 'text-green-400', OFF: 'text-gray-400' });
  renderAktuator(el.iconPompa, el.valPompa, s.statusPompa, { ON: '💧', OFF: '⭕' }, { ON: 'text-blue-400',  OFF: 'text-gray-400' });
  renderBuzzer();

  // Emergency banner
  updateEmergencyBanner(s.kodeState);
}

function renderAktuator(iconEl, labelEl, val, icons, colors) {
  iconEl.textContent  = icons[val]  || '⭕';
  labelEl.textContent = val;
  labelEl.className   = `font-bold mt-1 ${colors[val] || 'text-gray-400'}`;
}

function renderBuzzer() {
  const val = appState.statusBuzzer;
  const icons   = { DIAM: '🔕', BERDENYUT: '🔔', KONTINU: '🚨' };
  const colors  = { DIAM: 'text-gray-400', BERDENYUT: 'text-yellow-400', KONTINU: 'text-red-400' };
  el.iconBuzzer.textContent  = icons[val]  || '🔔';
  el.valBuzzer.textContent   = val;
  el.valBuzzer.className     = `font-bold mt-1 ${colors[val] || 'text-gray-400'}`;
}

// ── Emergency banner ──────────────────────────────────────────────
export function updateEmergencyBanner(kode) {
  if (kode >= 5) {
    el.emergencyBanner.classList.remove('hidden');
    const meta = STATE_META[kode];
    el.emergencyTitle.textContent = `BAHAYA — ${meta.nama.toUpperCase()}`;
    el.emergencySub.textContent   = meta.desc;
  } else {
    el.emergencyBanner.classList.add('hidden');
  }
}

// ── Connection indicator ──────────────────────────────────────────
export function setConnectionStatus(online) {
  if (online) {
    el.connDot.className    = 'inline-block w-2.5 h-2.5 rounded-full bg-green-400';
    el.connLabel.textContent = 'Terhubung';
    el.serverOffBanner.classList.add('hidden');
  } else {
    el.connDot.className    = 'inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse';
    el.connLabel.textContent = 'Terputus';
    el.serverOffBanner.classList.remove('hidden');
  }
}

export function setLastUpdated(dtStr) {
  el.lastUpdated.textContent = dtStr ? fmtTime(dtStr) : '—';
}

export function showMockBadge() {
  el.mockBadge.classList.remove('hidden');
}

// ── Control tab ───────────────────────────────────────────────────
export function renderControlTab() {
  const s = appState;
  const meta = STATE_META[s.kodeState] || STATE_META[1];
  const c    = WARNA_CLASS[meta.warna];

  el.ctrlStateBadge.textContent = `State ${s.kodeState} · ${meta.kategori}`;
  el.ctrlStateBadge.className   = `rounded-full px-3 py-1 text-sm font-bold ${c.badge}`;
  el.ctrlStateNama.textContent  = meta.nama;
  el.ctrlSumber.textContent     = `sumber: ${s.sumberKontrol}`;

  el.ctrlValKipas.textContent  = s.cmdKipas;
  el.ctrlValPompa.textContent  = s.cmdPompa;
  el.ctrlValBuzzer.textContent = s.cmdBuzzer;

  // Safety warnings
  if (s.kodeState >= 5) {
    el.ctrlKipaWarn.classList.remove('hidden');
    el.ctrlMuteWarn.classList.remove('hidden');
  } else {
    el.ctrlKipaWarn.classList.add('hidden');
    el.ctrlMuteWarn.classList.add('hidden');
  }

  // Highlight active control buttons
  document.querySelectorAll('[data-ctrl="kipas"]').forEach(b => highlightCtrlBtn(b, s.cmdKipas));
  document.querySelectorAll('[data-ctrl="pompa"]').forEach(b => highlightCtrlBtn(b, s.cmdPompa));
  document.querySelectorAll('[data-ctrl="buzzer"]').forEach(b => highlightCtrlBtn(b, s.cmdBuzzer));

  // Disable kipas ON during state 5-8
  document.querySelectorAll('[data-ctrl="kipas"][data-val="ON"]').forEach(b => {
    b.disabled = s.kodeState >= 5;
    b.classList.toggle('opacity-40', s.kodeState >= 5);
    b.classList.toggle('cursor-not-allowed', s.kodeState >= 5);
  });
  // Disable buzzer MUTE during state 5-8
  document.querySelectorAll('[data-ctrl="buzzer"][data-val="MUTE"]').forEach(b => {
    b.disabled = s.kodeState >= 5;
    b.classList.toggle('opacity-40', s.kodeState >= 5);
    b.classList.toggle('cursor-not-allowed', s.kodeState >= 5);
  });
}

function highlightCtrlBtn(btn, activeVal) {
  if (btn.dataset.val === activeVal) {
    btn.classList.add('ring-2', 'ring-white', 'bg-gray-700');
  } else {
    btn.classList.remove('ring-2', 'ring-white', 'bg-gray-700');
  }
}

export function setCtrlBusy(busy) {
  document.querySelectorAll('.ctrl-btn').forEach(b => {
    b.disabled = busy;
    b.classList.toggle('opacity-50', busy);
  });
}

export function showCtrlNotif(msg, success) {
  el.ctrlNotif.textContent = msg;
  el.ctrlNotif.className = `rounded-lg p-3 mb-4 text-sm font-medium ${
    success ? 'bg-green-900 border border-green-600 text-green-200' : 'bg-red-900 border border-red-600 text-red-200'
  }`;
  el.ctrlNotif.classList.remove('hidden');
  clearTimeout(el.ctrlNotif._timer);
  el.ctrlNotif._timer = setTimeout(() => el.ctrlNotif.classList.add('hidden'), 4000);
}

// Pump countdown display
let _pumpCountInterval = null;
export function startPumpCountdown(seconds = 10) {
  el.pumpCountWrap.classList.remove('hidden');
  let rem = seconds;
  el.pumpCountdown.textContent = rem;
  clearInterval(_pumpCountInterval);
  _pumpCountInterval = setInterval(() => {
    rem--;
    if (rem <= 0) {
      clearInterval(_pumpCountInterval);
      el.pumpCountWrap.classList.add('hidden');
    } else {
      el.pumpCountdown.textContent = rem;
    }
  }, 1000);
}
export function stopPumpCountdown() {
  clearInterval(_pumpCountInterval);
  el.pumpCountWrap.classList.add('hidden');
}

// ── Alert table ───────────────────────────────────────────────────
export function renderAlertTable(rows) {
  const tbody = document.getElementById('alert-table-body');
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '';
    const tr = tbody.insertRow();
    const td = tr.insertCell();
    td.colSpan = 5;
    td.className = 'py-6 text-center text-gray-600';
    td.textContent = 'Tidak ada peringatan.';
    return;
  }
  tbody.innerHTML = '';
  for (const r of rows) {
    const tr = tbody.insertRow();
    tr.className = 'border-b border-gray-800 hover:bg-gray-800 transition';
    const cells = [
      fmtTime(r.waktu_mulai),
      r.waktu_selesai ? fmtTime(r.waktu_selesai) : '—',
      `State ${r.state_puncak}`,
      r.tingkat_risiko,
      r.status_alert,
    ];
    const aligns = ['text-left','text-left','text-center','text-center','text-center'];
    cells.forEach((txt, i) => {
      const td = tr.insertCell();
      td.className = `py-2 ${aligns[i]} text-sm`;
      td.textContent = txt;
      // Color badges
      if (i === 3) td.className += r.tingkat_risiko === 'BAHAYA' ? ' text-red-400 font-bold' : ' text-yellow-400 font-semibold';
      if (i === 4) td.className += r.status_alert === 'AKTIF'   ? ' text-orange-400 font-bold' : ' text-gray-400';
    });
  }
}

// ── Devices table ─────────────────────────────────────────────────
export function renderDevicesTable(rows) {
  const tbody = document.getElementById('devices-table-body');
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '';
    const tr = tbody.insertRow();
    const td = tr.insertCell();
    td.colSpan = 4; td.className = 'py-6 text-center text-gray-600';
    td.textContent = 'Tidak ada perangkat.';
    return;
  }
  tbody.innerHTML = '';
  for (const d of rows) {
    const tr = tbody.insertRow();
    tr.className = 'border-b border-gray-800 hover:bg-gray-800 transition';
    // ID
    const tdId = tr.insertCell(); tdId.className = 'py-2 font-mono text-sm text-left';
    tdId.textContent = d.id_device;
    // Lokasi
    const tdLok = tr.insertCell(); tdLok.className = 'py-2 text-sm text-left text-gray-300';
    tdLok.textContent = d.lokasi;
    // Status badge
    const tdSt = tr.insertCell(); tdSt.className = 'py-2 text-center';
    const badge = document.createElement('span');
    badge.textContent = d.status_perangkat;
    badge.className = d.status_perangkat === 'ONLINE'
      ? 'bg-green-800 text-green-200 text-xs font-bold px-2 py-1 rounded-full'
      : 'bg-gray-700  text-gray-300  text-xs font-bold px-2 py-1 rounded-full';
    tdSt.appendChild(badge);
    // Terakhir terlihat
    const tdT = tr.insertCell(); tdT.className = 'py-2 text-right text-xs text-gray-500';
    tdT.textContent = d.terakhir_terlihat ? fmtTime(d.terakhir_terlihat) : '—';
  }
}
