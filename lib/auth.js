const crypto = require('crypto');
const db = require('../db/connection');

// Secure password hashing using native PBKDF2
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedPassword) {
  try {
    const [salt, hash] = storedPassword.split(':');
    if (!salt || !hash) return false;
    const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return hash === verifyHash;
  } catch (e) {
    return false;
  }
}

// Session management
function createSession(userId) {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
  db.prepare(`
    INSERT INTO session (session_id, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(sessionId, userId, expiresAt);
  return sessionId;
}

function validateSession(sessionId) {
  try {
    const session = db.prepare(`
      SELECT s.session_id, s.expires_at, u.user_id, u.username, u.role
      FROM session s
      JOIN user u ON s.user_id = u.user_id
      WHERE s.session_id = ?
    `).get(sessionId);

    if (!session) return null;

    // Check expiration
    if (new Date(session.expires_at) < new Date()) {
      deleteSession(sessionId);
      return null;
    }

    return {
      userId: session.user_id,
      username: session.username,
      role: session.role
    };
  } catch (err) {
    return null;
  }
}

function deleteSession(sessionId) {
  try {
    db.prepare('DELETE FROM session WHERE session_id = ?').run(sessionId);
  } catch (err) {
    // Ignore error on deletion
  }
}

function seedDefaultUser() {
  try {
    const admin1User = db.prepare("SELECT * FROM user WHERE username = 'admin1'").get();
    const newHash = hashPassword('dr8282');

    if (!admin1User) {
      console.log('👤 Seeding default admin user (username: admin1, password: dr8282)...');
      db.prepare(`
        INSERT INTO user (username, password_hash, role)
        VALUES (?, ?, ?)
      `).run('admin1', newHash, 'admin');
      console.log('✔  Default admin user (admin1) seeded.');

      // Clean up old 'admin' user to avoid confusion
      db.prepare("DELETE FROM user WHERE username = 'admin'").run();
    } else {
      // Ensure password hash is updated to 'dr8282'
      db.prepare("UPDATE user SET password_hash = ? WHERE username = 'admin1'").run(newHash);
    }
  } catch (err) {
    console.error('✖ Failed to seed default user:', err);
  }
}

function seedDefaultLocations() {
  try {
    // Check if there is any active Warehouse
    const warehouse = db.prepare("SELECT * FROM location WHERE type = 'Warehouse' AND is_active = 1").get();
    if (!warehouse) {
      console.log('📦 Seeding default Warehouse (المستودع الرئيسي)...');
      db.prepare(`
        INSERT INTO location (name, type, address, max_capacity, importance_level)
        VALUES (?, 'Warehouse', ?, 500000, 5)
      `).run('المستودع الرئيسي', 'المنطقة المركزية');
    }

    // Check if there is any active Supplier
    const supplier = db.prepare("SELECT * FROM location WHERE type = 'Supplier' AND is_active = 1").get();
    if (!supplier) {
      console.log('🏢 Seeding default Supplier (المورد الافتراضي)...');
      db.prepare(`
        INSERT INTO location (name, type, address, max_capacity, importance_level)
        VALUES (?, 'Supplier', ?, 50000, 3)
      `).run('المورد الافتراضي', 'المنطقة المركزية');
    }
  } catch (err) {
    console.error('✖ Failed to seed default locations:', err);
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  validateSession,
  deleteSession,
  seedDefaultUser,
  seedDefaultLocations
};
