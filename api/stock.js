/**
 * Routes: /api/stock
 */
const { Router } = require('express');
const { asyncHandler, requireFields } = require('./middleware');
const {
  deductStock,
  transferStock,
  receiveStock,
  getLowStock,
  getExporterInventory,
} = require('../lib/stock');

const router = Router();

router.post('/receive',
  requireFields('location_id', 'batch_no', 'quantity'),
  asyncHandler((req, res) => {
    const { location_id, batch_no, quantity, reorder_point, note } = req.body;
    const result = receiveStock(location_id, batch_no, quantity, reorder_point || 0, note);
    res.status(201).json(result);
  })
);

router.post('/deduct',
  requireFields('location_id', 'product_id', 'quantity'),
  asyncHandler((req, res) => {
    const { location_id, product_id, quantity, note } = req.body;
    const result = deductStock(location_id, product_id, quantity, note);

    if (!result.success) {
      return res.status(409).json(result);
    }
    res.json(result);
  })
);

router.post('/transfer',
  requireFields('from_location_id', 'to_location_id', 'product_id', 'quantity'),
  asyncHandler((req, res) => {
    const { from_location_id, to_location_id, product_id, quantity, note } = req.body;
    const result = transferStock(from_location_id, to_location_id, product_id, quantity, note);

    if (!result.success) {
      return res.status(409).json(result);
    }
    res.json(result);
  })
);

router.get('/low', asyncHandler((req, res) => {
  const locationId = req.query.location_id ? parseInt(req.query.location_id, 10) : null;
  const rows = getLowStock(locationId);
  res.json(rows);
}));

router.get('/exporters', asyncHandler((req, res) => {
  const rows = getExporterInventory(req.query.name || null);
  res.json(rows);
}));

module.exports = router;
