/**
 * Routes: /api/movements
 */
const { Router } = require('express');
const db = require('../db/connection');
const { asyncHandler } = require('./middleware');

const router = Router();

router.get('/', asyncHandler((req, res) => {
  const { batch_no, location_id, limit } = req.query;
  const conditions = [];
  const params = [];

  if (batch_no) {
    params.push(batch_no);
    conditions.push(`sm.batch_no = ?`);
  }

  if (location_id) {
    params.push(parseInt(location_id, 10));
    params.push(parseInt(location_id, 10));
    conditions.push(`(sm.from_location = ? OR sm.to_location = ?)`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const cap = Math.min(parseInt(limit, 10) || 100, 500);

  const rows = db.prepare(`
    SELECT sm.movement_id, sm.batch_no,
           p.sku, p.name AS product_name,
           sm.from_location, fl.name AS from_name,
           sm.to_location,   tl.name AS to_name,
           sm.quantity, sm.movement, sm.reference_note, sm.created_at
    FROM stock_movement sm
    JOIN batch    b  ON b.batch_no    = sm.batch_no
    JOIN product  p  ON p.product_id  = b.product_id
    LEFT JOIN location fl ON fl.location_id = sm.from_location
    LEFT JOIN location tl ON tl.location_id = sm.to_location
    ${where}
    ORDER BY sm.created_at DESC
    LIMIT ${cap}
  `).all(...params);

  res.json(rows);
}));

module.exports = router;
