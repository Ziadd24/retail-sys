/**
 * Lightweight migration runner for SQLite.
 */
const fs   = require('fs');
const path = require('path');
const db = require('./connection');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function ensureMigrationsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      filename   TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function getApplied() {
  const rows = db.prepare('SELECT filename FROM _migrations ORDER BY id').all();
  return rows.map((r) => r.filename);
}

function getMigrationFiles(direction) {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(`.${direction}.sql`))
    .sort();
}

function migrateUp() {
  ensureMigrationsTable();
  const applied = getApplied();
  const upFiles = getMigrationFiles('up');

  const pending = upFiles.filter((f) => {
    const name = f.replace('.up.sql', '');
    return !applied.includes(name);
  });

  if (pending.length === 0) {
    console.log('✔  All migrations already applied.');
    return;
  }

  for (const file of pending) {
    const sql  = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const name = file.replace('.up.sql', '');
    console.log(`⏳ Applying: ${name} ...`);
    
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT OR IGNORE INTO _migrations (filename) VALUES (?)').run(name);
    })();
    
    console.log(`✔  Applied:  ${name}`);
  }
}

function migrateDown() {
  ensureMigrationsTable();
  const applied = getApplied();

  if (applied.length === 0) {
    console.log('✔  Nothing to rollback.');
    return;
  }

  const last     = applied[applied.length - 1];
  const downFile = `${last}.down.sql`;
  const downPath = path.join(MIGRATIONS_DIR, downFile);

  if (!fs.existsSync(downPath)) {
    console.error(`✖  Down migration not found: ${downFile}`);
    process.exit(1);
  }

  console.log(`⏳ Rolling back: ${last} ...`);
  const sql = fs.readFileSync(downPath, 'utf8');
  
  db.transaction(() => {
    db.exec(sql);
  })();
  
  console.log(`✔  Rolled back:  ${last}`);
}

try {
  const direction = process.argv[2];
  if (direction === 'down') {
    migrateDown();
  } else {
    migrateUp();
  }
} catch (err) {
  console.error('Migration failed:', err);
  process.exit(1);
}
