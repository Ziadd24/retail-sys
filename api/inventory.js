const express = require('express');
const router = express.Router();
const db = require('../db/connection');

// GET /api/inventory
// Returns a flat list of all stock items joined with product, batch, and location info
router.get('/', (req, res, next) => {
  try {
    const inventory = db.prepare(`
      SELECT 
        sl.location_id,
        l.name as location_name,
        l.type as location_type,
        sl.batch_no,
        b.expiry_date,
        p.product_id,
        p.name as product_name,
        p.category,
        p.sku,
        sl.quantity,
        sl.reorder_point
      FROM stock_level sl
      JOIN location l ON sl.location_id = l.location_id
      JOIN batch b ON sl.batch_no = b.batch_no
      JOIN product p ON b.product_id = p.product_id
      WHERE sl.quantity > 0
      ORDER BY l.name ASC, b.expiry_date ASC
    `).all();

    res.json(inventory);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
