-- ============================================================
-- patch_v2.sql — Migrasi dari v1 ke v2 (jalankan sekali saja)
-- Tambah kolom terakhir_terlihat & api_key_hash jika belum ada
-- Jalankan: sudo mysql smart_kitchen < patch_v2.sql
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = '+07:00';

-- Tambah kolom terakhir_terlihat ke tabel devices (kalau belum ada)
ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS terakhir_terlihat DATETIME NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS api_key_hash      VARCHAR(64) NOT NULL DEFAULT '';

-- Seed device DAPUR01
-- api_key_hash = SHA-256("Smart*2026")  → dihitung dengan Node.js
-- Jika API_KEY di config.h berbeda, hitung ulang:
--   node -e "require('crypto').createHash('sha256').update('APIKEY_ANDA').digest('hex')"
INSERT INTO devices (id_device, lokasi, tanggal_pasang, api_key_hash)
VALUES ('DAPUR01', 'Dapur Bersama Lt. 1', CURDATE(),
        'cdd02caf699920eab2c64d22740e95babb9a506c2c1ac82cc67a610319b2c7b1')
ON DUPLICATE KEY UPDATE
  lokasi       = VALUES(lokasi),
  api_key_hash = VALUES(api_key_hash);

-- Tambah baris device_control jika belum ada
INSERT IGNORE INTO device_control (id_device) VALUES ('DAPUR01');
