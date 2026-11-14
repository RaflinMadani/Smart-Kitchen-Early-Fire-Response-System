-- ============================================================
-- smart_kitchen.sql  — DDL + seed (import ke MySQL 8.0 / MariaDB)
-- Dibuat untuk Smart Kitchen Early Fire Response System
-- Jalankan: sudo mysql smart_kitchen < smart_kitchen.sql
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = '+07:00';

-- 1. Data induk perangkat
CREATE TABLE IF NOT EXISTS devices (
  id_device          VARCHAR(20)  NOT NULL,
  lokasi             VARCHAR(100) NOT NULL,
  status_perangkat   ENUM('ONLINE','OFFLINE') NOT NULL DEFAULT 'OFFLINE',
  tanggal_pasang     DATE NOT NULL,
  terakhir_terlihat  DATETIME NULL DEFAULT NULL,
  api_key_hash       VARCHAR(64) NOT NULL DEFAULT '',
  PRIMARY KEY (id_device)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Riwayat pembacaan sensor
--    kode_state : 1=Normal | 2=Thermal Warning | 3=Gas/Smoke Warning | 4=Pre-Combustion
--                 5-8=Critical Fire (8 = api+asap+panas)
CREATE TABLE IF NOT EXISTS sensor_logs (
  id_log         BIGINT          NOT NULL AUTO_INCREMENT,
  id_device      VARCHAR(20)     NOT NULL,
  waktu_rekam    DATETIME        NOT NULL,
  suhu_celcius   DECIMAL(4,1)    NULL,
  kelembapan_rh  DECIMAL(4,1)    NULL,
  mq2_adc        SMALLINT UNSIGNED NULL,
  status_api     ENUM('TIDAK_ADA','TERDETEKSI') NOT NULL,
  kode_state     TINYINT UNSIGNED NOT NULL,
  tingkat_risiko ENUM('AMAN','WASPADA','BAHAYA') NOT NULL,
  status_kipas   ENUM('OFF','ON') NOT NULL DEFAULT 'OFF',
  status_pompa   ENUM('OFF','ON') NOT NULL DEFAULT 'OFF',
  status_buzzer  ENUM('DIAM','BERDENYUT','KONTINU') NOT NULL DEFAULT 'DIAM',
  sumber_kontrol ENUM('OTOMATIS','MANUAL_APP') NOT NULL DEFAULT 'OTOMATIS',
  PRIMARY KEY (id_log),
  INDEX idx_sl_dev_waktu (id_device, waktu_rekam),
  CONSTRAINT fk_sl_dev FOREIGN KEY (id_device) REFERENCES devices(id_device)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Episode peringatan
CREATE TABLE IF NOT EXISTS alert_logs (
  id_alert       BIGINT          NOT NULL AUTO_INCREMENT,
  id_device      VARCHAR(20)     NOT NULL,
  id_log_pemicu  BIGINT          NULL,
  state_puncak   TINYINT UNSIGNED NOT NULL,
  tingkat_risiko ENUM('WASPADA','BAHAYA') NOT NULL,
  status_alert   ENUM('AKTIF','SELESAI') NOT NULL DEFAULT 'AKTIF',
  waktu_mulai    DATETIME        NOT NULL,
  waktu_selesai  DATETIME        NULL,
  PRIMARY KEY (id_alert),
  INDEX idx_al_dev_mulai (id_device, waktu_mulai),
  CONSTRAINT fk_al_dev FOREIGN KEY (id_device)     REFERENCES devices(id_device),
  CONSTRAINT fk_al_log FOREIGN KEY (id_log_pemicu) REFERENCES sensor_logs(id_log)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Perintah kontrol (1 baris per perangkat)
CREATE TABLE IF NOT EXISTS device_control (
  id_device       VARCHAR(20) NOT NULL,
  cmd_kipas       ENUM('AUTO','ON','OFF')  NOT NULL DEFAULT 'AUTO',
  cmd_pompa       ENUM('AUTO','ON','OFF')  NOT NULL DEFAULT 'AUTO',
  cmd_buzzer      ENUM('AUTO','MUTE','ON') NOT NULL DEFAULT 'AUTO',
  sumber_kontrol  ENUM('OTOMATIS','MANUAL_APP') NOT NULL DEFAULT 'OTOMATIS',
  terakhir_diubah TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_device),
  CONSTRAINT fk_dc_dev FOREIGN KEY (id_device) REFERENCES devices(id_device)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- View: kondisi terbaru tiap perangkat (untuk dasbor)
CREATE OR REPLACE VIEW v_status_terbaru AS
SELECT d.id_device, d.lokasi, d.status_perangkat,
       s.waktu_rekam, s.suhu_celcius, s.kelembapan_rh, s.mq2_adc, s.status_api,
       s.kode_state, s.tingkat_risiko, s.status_kipas, s.status_pompa, s.status_buzzer
FROM devices d
LEFT JOIN sensor_logs s
  ON s.id_log = (SELECT MAX(id_log) FROM sensor_logs WHERE id_device = d.id_device);

-- ================================================================
-- Seed data awal (wajib ada sebelum menjalankan backend)
-- ================================================================

-- Device DAPUR01
-- api_key_hash = SHA-256("Smart*2026")
-- Untuk menghitung ulang: node -e "require('crypto').createHash('sha256').update('Smart*2026').digest('hex')" | Write-Output
-- Atau di Linux: echo -n "Smart*2026" | sha256sum
INSERT INTO devices (
    id_device, 
    lokasi, 
    status_perangkat, 
    tanggal_pasang, 
    api_key_hash
)
VALUES (
    'DAPUR01',
    'Dapur Bersama Lt. 1',
    'OFFLINE',
    CURDATE(),
    SHA2('Smart*2026', 256)
)
ON DUPLICATE KEY UPDATE
    lokasi       = VALUES(lokasi),
    api_key_hash = VALUES(api_key_hash);

-- Baris device_control untuk DAPUR01 (semua AUTO = mode otomatis)
INSERT IGNORE INTO device_control (id_device, cmd_kipas, cmd_pompa, cmd_buzzer, sumber_kontrol)
VALUES ('DAPUR01', 'AUTO', 'AUTO', 'AUTO', 'OTOMATIS');
