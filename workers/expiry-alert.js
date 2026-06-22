/**
 * Expiry Alert Worker
 */
const db = require('../db/connection');

function scanAndAlert() {
  const rows = db.prepare(`
    SELECT
      sl.location_id,
      l.name AS location_name,
      sl.batch_no,
      p.name AS product_name,
      p.sku,
      b.expiry_date,
      sl.quantity,
      CAST(julianday(b.expiry_date) - julianday('now') AS INTEGER) AS days_until_expiry
    FROM stock_level sl
    JOIN batch    b ON b.batch_no    = sl.batch_no
    JOIN product  p ON p.product_id  = b.product_id
    JOIN location l ON l.location_id = sl.location_id
    WHERE b.expiry_date <= date('now', '+4 months')
      AND b.expiry_date >  date('now')
      AND sl.quantity   >  0
    ORDER BY b.expiry_date ASC
  `).all();

  if (rows.length === 0) {
    console.log('✔  No batches approaching expiry within 4 months.');
    return { alertsCreated: 0 };
  }

  let created = 0;
  let skipped = 0;

  db.transaction(() => {
    const insertAlert = db.prepare(`
      INSERT OR IGNORE INTO expiry_alert (batch_no, location_id, alert_date, expiry_date)
      VALUES (?, ?, date('now'), ?)
    `);

    for (const row of rows) {
      const result = insertAlert.run(row.batch_no, row.location_id, row.expiry_date);

      if (result.changes > 0) {
        created++;
        console.log(
          `⚠  ALERT: ${row.product_name} (${row.sku}) — Batch ${row.batch_no}` +
          ` @ ${row.location_name} — expires ${row.expiry_date}` +
          ` (${row.days_until_expiry} days) — qty: ${row.quantity}`
        );
      } else {
        skipped++;
      }
    }
  })();

  console.log(`\n✔  Done. Created: ${created} alert(s), Skipped (already alerted): ${skipped}.`);
  return { alertsCreated: created, skipped };
}

function getPendingAlerts() {
  return db.prepare(`
    SELECT
      ea.alert_id,
      ea.batch_no,
      p.sku,
      p.name AS product_name,
      l.name AS location_name,
      ea.expiry_date,
      CAST(julianday(ea.expiry_date) - julianday('now') AS INTEGER) AS days_until_expiry,
      ea.alert_date
    FROM expiry_alert ea
    JOIN batch    b ON b.batch_no    = ea.batch_no
    JOIN product  p ON p.product_id  = b.product_id
    JOIN location l ON l.location_id = ea.location_id
    WHERE ea.acknowledged = 0
    ORDER BY ea.expiry_date ASC
  `).all();
}

function acknowledgeAlert(alertId) {
  const result = db.prepare('UPDATE expiry_alert SET acknowledged = 1 WHERE alert_id = ?').run(alertId);
  return result.changes > 0;
}

if (require.main === module) {
  try {
    console.log(`🔍 Scanning for batches expiring within 4 months...\n`);
    scanAndAlert();
  } catch (err) {
    console.error('✖  Expiry alert worker failed:', err);
    process.exit(1);
  }
}

module.exports = { scanAndAlert, getPendingAlerts, acknowledgeAlert };
