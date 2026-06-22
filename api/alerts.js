/**
 * Routes: /api/alerts
 */
const { Router } = require('express');
const { asyncHandler } = require('./middleware');
const { scanAndAlert, getPendingAlerts, acknowledgeAlert } = require('../workers/expiry-alert');

const router = Router();

router.get('/', asyncHandler((_req, res) => {
  const rows = getPendingAlerts();
  res.json(rows);
}));

router.post('/scan', asyncHandler((_req, res) => {
  const result = scanAndAlert();
  res.json(result);
}));

router.patch('/:id/acknowledge', asyncHandler((req, res) => {
  const ok = acknowledgeAlert(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Alert not found' });
  res.json({ acknowledged: true });
}));

module.exports = router;
