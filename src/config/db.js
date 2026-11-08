'use strict';
const mysql = require('mysql2/promise');
const cfg = require('./env');
const logger = require('../utils/logger');

const pool = mysql.createPool(cfg.db);

pool.getConnection()
  .then(conn => { conn.release(); logger.info('[db] MySQL pool connected'); })
  .catch(err => { logger.error('[db] MySQL pool error: ' + err.message); process.exit(1); });

module.exports = pool;
