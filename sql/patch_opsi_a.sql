-- ============================================================
-- patch_opsi_a.sql — patch DDL + seed untuk Smart Kitchen
-- Kompatibel dengan MySQL 8.0 (TIDAK pakai ADD COLUMN IF NOT EXISTS)
-- Jalankan: sudo mysql smart_kitchen < patch_opsi_a.sql
-- ============================================================

USE smart_kitchen;

-- ────────────────────────────────────────────────────────────
-- 1. Tambah kolom api_key_hash (skip jika sudah ada)
-- ────────────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS _add_col_api_key_hash;
DELIMITER $$
CREATE PROCEDURE _add_col_api_key_hash()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'devices'
      AND COLUMN_NAME  = 'api_key_hash'
  ) THEN
    ALTER TABLE devices ADD COLUMN api_key_hash CHAR(64) NULL AFTER lokasi;
  END IF;
END$$
DELIMITER ;
CALL _add_col_api_key_hash();
DROP PROCEDURE IF EXISTS _add_col_api_key_hash;

-- ────────────────────────────────────────────────────────────
-- 2. Tambah kolom terakhir_terlihat (skip jika sudah ada)
-- ────────────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS _add_col_terakhir_terlihat;
DELIMITER $$
CREATE PROCEDURE _add_col_terakhir_terlihat()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'devices'
      AND COLUMN_NAME  = 'terakhir_terlihat'
  ) THEN
    ALTER TABLE devices ADD COLUMN terakhir_terlihat DATETIME NULL AFTER status_perangkat;
  END IF;
END$$
DELIMITER ;
CALL _add_col_terakhir_terlihat();
DROP PROCEDURE IF EXISTS _add_col_terakhir_terlihat;

-- ────────────────────────────────────────────────────────────
-- 3. CHECK constraint sensor_logs (skip jika sudah ada)
-- ────────────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS _add_chk_sl_state;
DELIMITER $$
CREATE PROCEDURE _add_chk_sl_state()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA     = DATABASE()
      AND TABLE_NAME       = 'sensor_logs'
      AND CONSTRAINT_NAME  = 'chk_sl_state'
  ) THEN
    ALTER TABLE sensor_logs
      ADD CONSTRAINT chk_sl_state CHECK (kode_state BETWEEN 1 AND 8);
  END IF;
END$$
DELIMITER ;
CALL _add_chk_sl_state();
DROP PROCEDURE IF EXISTS _add_chk_sl_state;

-- ────────────────────────────────────────────────────────────
-- 4. CHECK constraint alert_logs (skip jika sudah ada)
-- ────────────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS _add_chk_al_state;
DELIMITER $$
CREATE PROCEDURE _add_chk_al_state()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA     = DATABASE()
      AND TABLE_NAME       = 'alert_logs'
      AND CONSTRAINT_NAME  = 'chk_al_state'
  ) THEN
    ALTER TABLE alert_logs
      ADD CONSTRAINT chk_al_state CHECK (state_puncak BETWEEN 2 AND 8);
  END IF;
END$$
DELIMITER ;
CALL _add_chk_al_state();
DROP PROCEDURE IF EXISTS _add_chk_al_state;

-- ────────────────────────────────────────────────────────────
-- 5. Ubah FK fk_al_log ke ON DELETE SET NULL
-- ────────────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS _fix_fk_al_log;
DELIMITER $$
CREATE PROCEDURE _fix_fk_al_log()
BEGIN
  -- Hapus FK lama jika ada
  IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA    = DATABASE()
      AND TABLE_NAME      = 'alert_logs'
      AND CONSTRAINT_NAME = 'fk_al_log'
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE alert_logs DROP FOREIGN KEY fk_al_log;
  END IF;
  -- Tambah ulang dengan ON DELETE SET NULL
  ALTER TABLE alert_logs
    ADD CONSTRAINT fk_al_log
      FOREIGN KEY (id_log_pemicu) REFERENCES sensor_logs(id_log) ON DELETE SET NULL;
END$$
DELIMITER ;
CALL _fix_fk_al_log();
DROP PROCEDURE IF EXISTS _fix_fk_al_log;

-- ────────────────────────────────────────────────────────────
-- 6. Seed perangkat DAPUR01
--    Ganti GANTI_DENGAN_API_KEY_ANDA dengan API key mentah kamu
--    (hasil: openssl rand -hex 16)
-- ────────────────────────────────────────────────────────────
INSERT IGNORE INTO devices (id_device, lokasi, tanggal_pasang, api_key_hash)
VALUES (
  'DAPUR01',
  'Dapur Bersama Lt. 1',
  CURDATE(),
  SHA2('bf8d15ce05cdb4fbe0d2498e3f75ce6e', 256)
);

INSERT IGNORE INTO device_control (id_device) VALUES ('DAPUR01');

-- ────────────────────────────────────────────────────────────
-- Verifikasi akhir
-- ────────────────────────────────────────────────────────────
SELECT id_device, lokasi, status_perangkat,
       api_key_hash IS NOT NULL AS has_key,
       terakhir_terlihat
FROM devices;
