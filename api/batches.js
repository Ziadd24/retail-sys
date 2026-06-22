/**
 * Routes: /api/batches
 */
const { Router } = require('express');
const db = require('../db/connection');
const { asyncHandler, requireFields } = require('./middleware');

const router = Router();

router.get('/', asyncHandler((req, res) => {
  const { product_id, near_expiry } = req.query;
  const conditions = [];
  const params = [];

  if (product_id) {
    params.push(product_id);
    conditions.push(`b.product_id = ?`);
  }

  if (near_expiry === 'true') {
    conditions.push(`b.expiry_date <= date('now', '+4 months')`);
    conditions.push(`b.expiry_date > date('now')`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT b.batch_no, b.product_id, p.sku, p.name AS product_name,
           b.expiry_date, b.manufactured,
           CAST(julianday(b.expiry_date) - julianday('now') AS INTEGER) AS days_until_expiry,
           COALESCE(SUM(sl.quantity), 0) AS total_stock
    FROM batch b
    JOIN product p ON p.product_id = b.product_id
    LEFT JOIN stock_level sl ON sl.batch_no = b.batch_no
    ${where}
    GROUP BY b.batch_no, p.sku, p.name
    ORDER BY b.expiry_date ASC
  `).all(...params);

  res.json(rows);
}));

router.post('/', requireFields('batch_no', 'product_id', 'expiry_date'), asyncHandler((req, res) => {
  const { batch_no, product_id, expiry_date, manufactured } = req.body;
  db.prepare(`
    INSERT INTO batch (batch_no, product_id, expiry_date, manufactured)
    VALUES (?, ?, ?, ?)
  `).run(batch_no, product_id, expiry_date, manufactured || null);
  
  const batch = db.prepare('SELECT * FROM batch WHERE batch_no = ?').get(batch_no);
  res.status(201).json(batch);
}));

router.delete('/:batch_no', asyncHandler((req, res) => {
  const { batch_no } = req.params;
  try {
    const result = db.prepare('DELETE FROM batch WHERE batch_no = ?').run(batch_no);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'لم يتم العثور على التشغيلة' });
    }
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      return res.status(400).json({ error: 'لا يمكن حذف هذه التشغيلة لوجود كميات مرتبطة بها بالمخزون.' });
    }
    throw err;
  }
}));

module.exports = router;
