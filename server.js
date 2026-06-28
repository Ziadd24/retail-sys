/**
 * Vet Monitor — API Server
 *
 * Entry point. Mounts all route modules and starts listening.
 * Auto-migrates and auto-seeds the SQLite database on first run.
 *
 *   npm start       — production
 *   npm run dev     — development (auto-restart on file changes)
 */
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { errorHandler } = require('./api/middleware');
const db = require('./db/connection');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Auto Setup ───────────────────────────────────────────────────────
try {
  console.log('📦 Auto-migrating database...');
  require('child_process').execSync('npm run migrate', { stdio: 'inherit' });

  // Seed default admin user
  require('./lib/auth').seedDefaultUser();
} catch (err) {
  console.error('✖ Auto-setup failed:', err);
}

// ─── Global middleware ────────────────────────────────────────────────
const allowedOrigin = process.env.CORS_ORIGIN || `http://localhost:${PORT}`;
app.use(cors({ origin: allowedOrigin }));
app.use(express.json());

// ─── Serve dashboard frontend ─────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Health check ─────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Auth routes (unprotected) ────────────────────────────────────────
app.use('/api/auth', require('./api/auth'));

// ─── Authenticate middleware for rest of api ──────────────────────────
const { authenticate } = require('./api/middleware');
app.use('/api', authenticate);

// ─── Shutdown route (protected) ───────────────────────────────────────
app.post('/api/shutdown', (req, res) => {
  res.json({ success: true, message: 'Server is shutting down...' });
  console.log('🛑 Shutdown request received. Exiting process in 1 second...');
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

// ─── Route modules (protected) ────────────────────────────────────────
app.use('/api/products',   require('./api/products'));
app.use('/api/batches',    require('./api/batches'));
app.use('/api/locations',  require('./api/locations'));
app.use('/api/stock',      require('./api/stock'));
app.use('/api/alerts',     require('./api/alerts'));
app.use('/api/movements',  require('./api/movements'));
app.use('/api/inventory',  require('./api/inventory'));
app.use('/api/reports',    require('./api/reports'));
app.use('/api/offers',     require('./api/offers'));
app.use('/api/analytics',  require('./api/analytics'));

// ─── Error handler (must be last) ─────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`🐾 Vet Monitor API running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n✖  Port ${PORT} is already in use.`);
    console.error(`   Fix: change PORT in .env, or kill the process using that port.\n`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  server.close(() => process.exit(0));
});
