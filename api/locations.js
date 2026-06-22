/**
 * Routes: /api/locations
 */
const { Router } = require('express');
const db = require('../db/connection');
const { asyncHandler, requireFields } = require('./middleware');

const router = Router();

router.get('/', asyncHandler((req, res) => {
  const { type } = req.query;
  let query = 'SELECT * FROM location WHERE is_active = 1 ORDER BY type, name';
  const params = [];

  if (type) {
    query = 'SELECT * FROM location WHERE is_active = 1 AND type = ? ORDER BY name';
    params.push(type);
  }

  const rows = db.prepare(query).all(...params);
  res.json(rows);
}));

router.get('/:id', asyncHandler((req, res) => {
  const { id } = req.params;

  const location = db.prepare('SELECT * FROM location WHERE location_id = ?').get(id);
  if (!location) return res.status(404).json({ error: 'Location not found' });

  const inventory = db.prepare(`
    SELECT sl.batch_no, p.sku, p.name AS product_name, p.category,
           b.expiry_date, sl.quantity, sl.reorder_point,
           CASE WHEN sl.quantity <= sl.reorder_point THEN 1 ELSE 0 END AS is_low
    FROM stock_level sl
    JOIN batch    b ON b.batch_no   = sl.batch_no
    JOIN product  p ON p.product_id = b.product_id
    WHERE sl.location_id = ? AND sl.quantity > 0
    ORDER BY b.expiry_date ASC
  `).all(id);

  res.json({ ...location, inventory });
}));

router.post('/', requireFields('name', 'type'), asyncHandler((req, res) => {
  const { name, type, address } = req.body;
  const result = db.prepare(`
    INSERT INTO location (name, type, address)
    VALUES (?, ?, ?)
  `).run(name, type, address || null);
  
  const location = db.prepare('SELECT * FROM location WHERE location_id = ?').get(result.lastInsertRowid);
  res.status(201).json(location);
}));

module.exports = router;
