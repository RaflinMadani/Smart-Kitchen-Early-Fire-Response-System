'use strict';
const path    = require('path');
const express = require('express');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const pool = require('./config/db');

const ingestRoutes  = require('./routes/ingest.routes');
const sensorRoutes  = require('./routes/sensor.routes');
const readRoutes    = require('./routes/read.routes');
const controlRoutes = require('./routes/control.routes');
const errorHandler  = require('./middlewares/errorHandler');

const app = express();

const DASHBOARD_DIR = path.join(__dirname, '..', 'dashboard');
console.log('[app] static dir:', DASHBOARD_DIR);

// HTTP mode (dev/demo) — semua header paksa-HTTPS dimatikan.
// useDefaults:false mencegah helmet menyuntikkan upgrade-insecure-requests otomatis.
app.use(helmet({
  strictTransportSecurity: false,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com'],
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
      connectSrc:  ["'self'"],
      imgSrc:      ["'self'", 'data:'],
      baseUri:     ["'self'"],
    },
  },
}));

app.use(express.json({ limit: '16kb' }));

const ingestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
});

app.get('/health', async (_req, res) => {
  try {
    await pool.execute('SELECT 1');
    res.json({ ok: true, ts: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.use(express.static(DASHBOARD_DIR));

app.use('/api/v1/ingest',  ingestLimiter, ingestRoutes);
app.use('/api/sensor',     ingestLimiter, sensorRoutes);
app.use('/api/v1/devices', readRoutes);
app.use('/api/v1/devices', controlRoutes);

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(DASHBOARD_DIR, 'index.html'));
});

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

app.use(errorHandler);

module.exports = app;