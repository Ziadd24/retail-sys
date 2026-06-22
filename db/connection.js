/**
 * Reusable SQLite connection.
 * Automatically creates the 'data' directory and 'vet-monitor.db' file.
 * Uses the native 'node:sqlite' module (Node.js 22.5+).
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'vet-monitor.db');
const db = new DatabaseSync(dbPath);

// Enable foreign keys
db.exec('PRAGMA foreign_keys = ON;');

// Helper method to wrap a function in a transaction since node:sqlite does not have db.transaction() like better-sqlite3 yet.
db.transaction = (fn) => {
  return (...args) => {
    db.exec('BEGIN TRANSACTION');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
};

module.exports = db;
