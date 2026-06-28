const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const srcPath = path.join(__dirname, '..', 'data', 'vet-monitor.db');
const destPath = path.join(__dirname, '..', 'data', 'vet-monitor-clean.db');

console.log('===================================================');
console.log('🐾 Vet Monitor - Handover Database Prep 🐾');
console.log('===================================================');
console.log('This utility creates a clean copy of your database for the doctor.');
console.log('It KEEPS all pharmacies, locations, and user logins, but deletes');
console.log('all medicines, batches, stock levels, sales, and movement logs.');
console.log('---------------------------------------------------');

// Check if source database exists
if (!fs.existsSync(srcPath)) {
  console.error(`✖ [ERROR] Active database file not found at: ${srcPath}`);
  console.error('Please run the system first to generate the database.');
  process.exit(1);
}

// Copy the file
try {
  fs.copyFileSync(srcPath, destPath);
  console.log(`✔ [INFO] Copied active database to temporary clean file:`);
  console.log(`  ${destPath}`);
} catch (err) {
  console.error('✖ [ERROR] Failed to copy database:', err.message);
  process.exit(1);
}

// Open the copy
let db;
try {
  db = new DatabaseSync(destPath);
} catch (err) {
  console.error('✖ [ERROR] Failed to open database copy:', err.message);
  process.exit(1);
}

// Disable foreign keys temporarily during truncate to prevent key check issues
db.exec('PRAGMA foreign_keys = OFF;');

const tablesToTruncate = [
  'stock_level',
  'stock_movement',
  'expiry_alert',
  'supplier_offer',
  'supplier_price_history',
  'batch',
  'product',
  'session',
  'supervisor_note',
  'order_request',
  'inventory_discrepancy'
];

try {
  db.exec('BEGIN TRANSACTION;');
  
  for (const table of tablesToTruncate) {
    db.prepare(`DELETE FROM ${table}`).run();
    console.log(`  - Cleared table data: ${table}`);
  }
  
  // Reset autoincrement sequences
  db.prepare(`
    DELETE FROM sqlite_sequence 
    WHERE name IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(...tablesToTruncate);
  console.log('  - Reset database ID sequences');

  db.exec('COMMIT;');
  
  // Re-enable foreign keys
  db.exec('PRAGMA foreign_keys = ON;');
  
  // Vacuum database to shrink files
  db.exec('VACUUM;');
  console.log('✔ [INFO] Database vacuumed and size optimized.');
  
  console.log('---------------------------------------------------');
  console.log('🎉 SUCCESS: Clean handover database created!');
  console.log('---------------------------------------------------');
  console.log('👉 To package this database for the doctor:');
  console.log('   1. Locate "data/vet-monitor-clean.db"');
  console.log('   2. Rename it to "vet-monitor.db"');
  console.log('   3. Put this file inside the "data/" folder of the doctor\'s installation ZIP.');
  console.log('   4. Send the ZIP to the doctor.');
  console.log('===================================================');
  
} catch (err) {
  try { db.exec('ROLLBACK;'); } catch(_) {}
  console.error('✖ [ERROR] Cleanup transaction failed:', err.message);
  
  // Clean up the incomplete file on error
  if (fs.existsSync(destPath)) {
    try { fs.unlinkSync(destPath); } catch(_) {}
  }
  process.exit(1);
}
