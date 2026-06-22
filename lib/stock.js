/**
 * FIFO Stock Operations
 *
 * Core business logic for stock deductions, transfers, and receiving.
 * All deductions follow First-In, First-Out: oldest expiry batches are consumed first.
 */
const db = require('../db/connection');

/**
 * Deduct stock from a location using FIFO (earliest expiry first).
 *
 * @param {number} locationId  - The location to deduct from
 * @param {number} productId   - The product to deduct
 * @param {number} qty         - Total quantity to deduct
 * @param {string} [note]      - Optional reference note for audit trail
 * @returns {Object} { success, deducted: [{ batch_no, qty_taken, remaining }] }
 */
function deductStock(locationId, productId, qty, note = null) {
  return db.transaction(() => {
    // Lock rows in FIFO order (earliest expiry first)
    // Note: SQLite doesn't have row-level FOR UPDATE locking, but the whole db.transaction() ensures serializability.
    const batches = db.prepare(`
      SELECT sl.batch_no, sl.quantity, b.expiry_date
       FROM stock_level sl
       JOIN batch b ON b.batch_no = sl.batch_no
       WHERE sl.location_id = ?
         AND b.product_id   = ?
         AND sl.quantity     > 0
       ORDER BY b.expiry_date ASC
    `).all(locationId, productId);

    const totalAvailable = batches.reduce((sum, b) => sum + b.quantity, 0);
    if (totalAvailable < qty) {
      return {
        success: false,
        error: `Insufficient stock. Requested: ${qty}, available: ${totalAvailable}`,
      };
    }

    let remaining = qty;
    const deducted = [];
    
    const updateStock = db.prepare(`
      UPDATE stock_level
      SET quantity = ?
      WHERE location_id = ? AND batch_no = ?
    `);
    
    const insertMovement = db.prepare(`
      INSERT INTO stock_movement
        (batch_no, from_location, to_location, quantity, movement, reference_note)
      VALUES (?, ?, NULL, ?, 'OUT', ?)
    `);

    for (const batch of batches) {
      if (remaining <= 0) break;

      const take = Math.min(batch.quantity, remaining);
      const newQty = batch.quantity - take;

      updateStock.run(newQty, locationId, batch.batch_no);

      // Audit trail
      insertMovement.run(batch.batch_no, locationId, take, note);

      deducted.push({
        batch_no: batch.batch_no,
        expiry_date: batch.expiry_date,
        qty_taken: take,
        remaining: newQty,
      });

      remaining -= take;
    }

    return { success: true, deducted };
  })();
}

/**
 * Transfer stock between two locations using FIFO.
 *
 * @param {number} fromLocationId
 * @param {number} toLocationId
 * @param {number} productId
 * @param {number} qty
 * @param {string} [note]
 * @returns {Object} { success, transfers: [{ batch_no, qty_moved }] }
 */
function transferStock(fromLocationId, toLocationId, productId, qty, note = null) {
  return db.transaction(() => {
    const batches = db.prepare(`
      SELECT sl.batch_no, sl.quantity, b.expiry_date
       FROM stock_level sl
       JOIN batch b ON b.batch_no = sl.batch_no
       WHERE sl.location_id = ?
         AND b.product_id   = ?
         AND sl.quantity     > 0
       ORDER BY b.expiry_date ASC
    `).all(fromLocationId, productId);

    const totalAvailable = batches.reduce((sum, b) => sum + b.quantity, 0);
    if (totalAvailable < qty) {
      return {
        success: false,
        error: `Insufficient stock at source. Requested: ${qty}, available: ${totalAvailable}`,
      };
    }

    let remaining = qty;
    const transfers = [];

    const updateSourceStock = db.prepare(`
      UPDATE stock_level SET quantity = quantity - ?
      WHERE location_id = ? AND batch_no = ?
    `);
    
    const upsertDestStock = db.prepare(`
      INSERT INTO stock_level (location_id, batch_no, quantity, reorder_point)
      VALUES (?, ?, ?, 0)
      ON CONFLICT (location_id, batch_no)
      DO UPDATE SET quantity = stock_level.quantity + EXCLUDED.quantity
    `);
    
    const insertMovement = db.prepare(`
      INSERT INTO stock_movement
        (batch_no, from_location, to_location, quantity, movement, reference_note)
      VALUES (?, ?, ?, ?, 'TRANSFER', ?)
    `);

    for (const batch of batches) {
      if (remaining <= 0) break;

      const take = Math.min(batch.quantity, remaining);

      // Decrease source
      updateSourceStock.run(take, fromLocationId, batch.batch_no);

      // Upsert destination
      upsertDestStock.run(toLocationId, batch.batch_no, take);

      // Audit trail
      insertMovement.run(batch.batch_no, fromLocationId, toLocationId, take, note);

      transfers.push({
        batch_no: batch.batch_no,
        expiry_date: batch.expiry_date,
        qty_moved: take,
      });

      remaining -= take;
    }

    return { success: true, transfers };
  })();
}

/**
 * Receive stock into a location (goods-in).
 *
 * @param {number} locationId
 * @param {string} batchNo
 * @param {number} qty
 * @param {number} [reorderPoint=0]
 * @param {string} [note]
 */
function receiveStock(locationId, batchNo, qty, reorderPoint = 0, note = null) {
  return db.transaction(() => {
    db.prepare(`
      INSERT INTO stock_level (location_id, batch_no, quantity, reorder_point)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (location_id, batch_no)
       DO UPDATE SET quantity = stock_level.quantity + EXCLUDED.quantity
    `).run(locationId, batchNo, qty, reorderPoint);

    db.prepare(`
      INSERT INTO stock_movement
         (batch_no, from_location, to_location, quantity, movement, reference_note)
       VALUES (?, NULL, ?, ?, 'IN', ?)
    `).run(batchNo, locationId, qty, note);

    return { success: true };
  })();
}

/**
 * Get low-stock items for a specific location (or all locations).
 *
 * @param {number|null} locationId - null for all locations
 * @returns {Array} rows from vw_low_stock
 */
function getLowStock(locationId = null) {
  const where = locationId ? 'WHERE location_id = ?' : '';
  const params = locationId ? [locationId] : [];
  return db.prepare(`SELECT * FROM vw_low_stock ${where} ORDER BY location_name, product_name`).all(...params);
}

/**
 * Get exporter-allocated inventory.
 *
 * @param {string|null} exporterName - null for all exporters
 * @returns {Array}
 */
function getExporterInventory(exporterName = null) {
  const where = exporterName ? 'WHERE exporter_name = ?' : '';
  const params = exporterName ? [exporterName] : [];
  return db.prepare(`SELECT * FROM vw_exporter_inventory ${where} ORDER BY exporter_name, product_name`).all(...params);
}

module.exports = {
  deductStock,
  transferStock,
  receiveStock,
  getLowStock,
  getExporterInventory,
};
