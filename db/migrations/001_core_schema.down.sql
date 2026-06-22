-- =============================================================
-- Rollback 001: Drop everything created by 001_core_schema.up.sql
-- =============================================================

DROP VIEW  IF EXISTS vw_near_expiry;
DROP VIEW  IF EXISTS vw_exporter_inventory;
DROP VIEW  IF EXISTS vw_low_stock;

DROP TABLE IF EXISTS stock_movement;
DROP TABLE IF EXISTS expiry_alert;
DROP TABLE IF EXISTS stock_level;
DROP TABLE IF EXISTS location;
DROP TABLE IF EXISTS batch;
DROP TABLE IF EXISTS product;

DELETE FROM _migrations WHERE filename = '001_core_schema';
