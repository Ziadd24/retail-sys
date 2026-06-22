-- =============================================================
-- Migration 001: Core Schema — Vet Pharmacy & Supply Chain
-- Target: SQLite
-- =============================================================

-- ─────────────────────────────────────────────
-- 2. PRODUCTS
-- ─────────────────────────────────────────────
CREATE TABLE product (
    product_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    sku          TEXT NOT NULL UNIQUE,
    name         TEXT NOT NULL,
    category     TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_product_category ON product (category);
CREATE INDEX idx_product_sku      ON product (sku);

-- ─────────────────────────────────────────────
-- 3. BATCHES  (tied to a product, carries expiry)
-- ─────────────────────────────────────────────
CREATE TABLE batch (
    batch_no     TEXT PRIMARY KEY,
    product_id   INTEGER NOT NULL REFERENCES product(product_id) ON DELETE RESTRICT,
    expiry_date  TEXT NOT NULL,
    manufactured TEXT,
    created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_batch_product    ON batch (product_id);
CREATE INDEX idx_batch_expiry     ON batch (expiry_date);

-- ─────────────────────────────────────────────
-- 4. LOCATIONS (6 pharmacies, 1 warehouse, N exporters)
-- ─────────────────────────────────────────────
CREATE TABLE location (
    location_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL UNIQUE,
    type         TEXT NOT NULL CHECK(type IN ('Pharmacy', 'Warehouse', 'Exporter')),
    address      TEXT,
    is_active    INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_location_type ON location (type);

-- ─────────────────────────────────────────────
-- 5. STOCK LEVELS  (quantity of a batch at a location)
-- ─────────────────────────────────────────────
CREATE TABLE stock_level (
    location_id    INTEGER NOT NULL REFERENCES location(location_id) ON DELETE RESTRICT,
    batch_no       TEXT NOT NULL REFERENCES batch(batch_no)   ON DELETE RESTRICT,
    quantity       INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    reorder_point  INTEGER NOT NULL DEFAULT 0 CHECK (reorder_point >= 0),
    updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (location_id, batch_no)
);

CREATE INDEX idx_stock_level_batch    ON stock_level (batch_no);
-- SQLite doesn't fully support partial indexes in the same way as PG for views, but we can do:
CREATE INDEX idx_stock_level_low      ON stock_level (quantity, reorder_point)
    WHERE quantity <= reorder_point;

-- ─────────────────────────────────────────────
-- 6. EXPIRY ALERTS  (populated by background worker)
-- ─────────────────────────────────────────────
CREATE TABLE expiry_alert (
    alert_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_no     TEXT NOT NULL REFERENCES batch(batch_no) ON DELETE CASCADE,
    location_id  INTEGER NOT NULL REFERENCES location(location_id) ON DELETE CASCADE,
    alert_date   TEXT NOT NULL,          -- date the alert was generated
    expiry_date  TEXT NOT NULL,          -- copied for fast reads
    acknowledged INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (batch_no, location_id, alert_date)   -- one alert per batch-location per day
);

CREATE INDEX idx_expiry_alert_pending ON expiry_alert (acknowledged) WHERE acknowledged = 0;

-- ─────────────────────────────────────────────
-- 7. STOCK MOVEMENTS  (audit trail for FIFO deductions)
-- ─────────────────────────────────────────────
CREATE TABLE stock_movement (
    movement_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_no        TEXT NOT NULL REFERENCES batch(batch_no) ON DELETE RESTRICT,
    from_location   INTEGER REFERENCES location(location_id),
    to_location     INTEGER REFERENCES location(location_id),
    quantity        INTEGER NOT NULL CHECK (quantity > 0),
    movement        TEXT NOT NULL CHECK(movement IN ('IN', 'OUT', 'TRANSFER', 'ADJUSTMENT')),
    reference_note  TEXT,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (
        (movement = 'IN'         AND from_location IS NULL AND to_location IS NOT NULL) OR
        (movement = 'OUT'        AND from_location IS NOT NULL AND to_location IS NULL) OR
        (movement = 'TRANSFER'   AND from_location IS NOT NULL AND to_location IS NOT NULL) OR
        (movement = 'ADJUSTMENT' AND (from_location IS NOT NULL OR to_location IS NOT NULL))
    )
);

CREATE INDEX idx_movement_batch   ON stock_movement (batch_no);
CREATE INDEX idx_movement_from    ON stock_movement (from_location);
CREATE INDEX idx_movement_to      ON stock_movement (to_location);
CREATE INDEX idx_movement_created ON stock_movement (created_at);

-- ─────────────────────────────────────────────
-- 9. VIEWS: convenience queries
-- ─────────────────────────────────────────────

-- Low-stock items
CREATE VIEW vw_low_stock AS
SELECT
    sl.location_id,
    l.name   AS location_name,
    l.type   AS location_type,
    sl.batch_no,
    p.sku,
    p.name   AS product_name,
    sl.quantity,
    sl.reorder_point,
    b.expiry_date
FROM stock_level sl
JOIN batch    b ON b.batch_no   = sl.batch_no
JOIN product  p ON p.product_id = b.product_id
JOIN location l ON l.location_id = sl.location_id
WHERE sl.quantity <= sl.reorder_point;

-- Exporter-allocated inventory
CREATE VIEW vw_exporter_inventory AS
SELECT
    l.name   AS exporter_name,
    p.sku,
    p.name   AS product_name,
    b.batch_no,
    b.expiry_date,
    sl.quantity
FROM stock_level sl
JOIN batch    b ON b.batch_no    = sl.batch_no
JOIN product  p ON p.product_id  = b.product_id
JOIN location l ON l.location_id = sl.location_id
WHERE l.type = 'Exporter';

-- Near-expiry batches
CREATE VIEW vw_near_expiry AS
SELECT
    b.batch_no,
    p.sku,
    p.name       AS product_name,
    b.expiry_date,
    CAST(julianday(b.expiry_date) - julianday('now') AS INTEGER) AS days_until_expiry,
    sl.location_id,
    l.name       AS location_name,
    sl.quantity
FROM batch b
JOIN product     p  ON p.product_id  = b.product_id
JOIN stock_level sl ON sl.batch_no   = b.batch_no
JOIN location    l  ON l.location_id = sl.location_id
WHERE b.expiry_date <= date('now', '+4 months')
  AND b.expiry_date >  date('now')
  AND sl.quantity > 0
ORDER BY b.expiry_date ASC;
