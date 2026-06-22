/**
 * Routes: /api/products
 */
const { Router } = require('express');
const db = require('../db/connection');
const { asyncHandler, requireFields } = require('./middleware');

const router = Router();

router.get('/', asyncHandler((req, res) => {
  const { category } = req.query;
  let query = 'SELECT * FROM product ORDER BY name';
  const params = [];

  if (category) {
    query = 'SELECT * FROM product WHERE category = ? ORDER BY name';
    params.push(category);
  }

  const rows = db.prepare(query).all(...params);
  res.json(rows);
}));

router.get('/:id', asyncHandler((req, res) => {
  const { id } = req.params;

  const product = db.prepare('SELECT * FROM product WHERE product_id = ?').get(id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const batches = db.prepare(`
    SELECT b.batch_no, b.expiry_date, b.manufactured,
           COALESCE(SUM(sl.quantity), 0) AS total_stock
    FROM batch b
    LEFT JOIN stock_level sl ON sl.batch_no = b.batch_no
    WHERE b.product_id = ?
    GROUP BY b.batch_no
    ORDER BY b.expiry_date ASC
  `).all(id);

  res.json({ ...product, batches });
}));

router.post('/', requireFields('name', 'category'), asyncHandler((req, res) => {
  let { sku, name, category } = req.body;
  
  if (!sku) {
    sku = 'VET-' + Math.random().toString(36).substr(2, 6).toUpperCase();
  }

  const result = db.prepare(`
    INSERT INTO product (sku, name, category)
    VALUES (?, ?, ?)
  `).run(sku, name, category);
  
  const product = db.prepare('SELECT * FROM product WHERE product_id = ?').get(result.lastInsertRowid);
  res.status(201).json(product);
}));

router.delete('/:id', asyncHandler((req, res) => {
  const { id } = req.params;
  try {
    const result = db.prepare('DELETE FROM product WHERE product_id = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'لم يتم العثور على الدواء' });
    }
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      return res.status(400).json({ error: 'لا يمكن حذف هذا الدواء لوجود كميات أو تشغيلات مرتبطة به بالمخزون.' });
    }
    throw err;
  }
}));

module.exports = router;
