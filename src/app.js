'use strict';
const express = require('express');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const pool = require('./config/db');

const ingestRoutes  = require('./routes/ingest.routes');
const readRoutes    = require('./routes/read.routes');
const controlRoutes = require('./routes/control.routes');
const errorHandler  = require('./middlewares/errorHandler');

const app = express();

// Security headers
app.use(helmet());

// Body parser
app.use(express.json({ limit: '16kb' }));

// Rate limiter on ingest (120 req/min per IP)
const ingestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
});

// Health check (no auth)
app.get('/health', async (_req, res) => {
  try {
    await pool.execute('SELECT 1');
    res.json({ ok: true, ts: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Routes
app.use('/api/v1/ingest',         ingestLimiter, ingestRoutes);
app.use('/api/v1/devices',        readRoutes);
app.use('/api/v1/devices',        controlRoutes);

// 404 catch
app.use((_req, res) => {
  res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

// Global error handler
app.use(errorHandler);

module.exports = app;
