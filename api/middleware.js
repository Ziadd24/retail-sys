/**
 * Async route handler wrapper.
 * Catches rejected promises and sync errors and forwards to Express error handler.
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    try {
      Promise.resolve(fn(req, res, next)).catch(next);
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Central error handler middleware.
 */
function errorHandler(err, _req, res, _next) {
  console.error('API Error:', err);

  // SQLite constraint violations -> 409 or 400
  if (err.message && err.message.includes('UNIQUE constraint failed')) {
    return res.status(409).json({ error: 'Duplicate entry', detail: err.message });
  }
  if (err.message && err.message.includes('FOREIGN KEY constraint failed')) {
    return res.status(400).json({ error: 'Referenced record not found', detail: err.message });
  }
  if (err.message && err.message.includes('CHECK constraint failed')) {
    return res.status(400).json({ error: 'Constraint violation', detail: err.message });
  }

  const status = err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
  });
}

/**
 * Validate that required body fields exist. Returns 400 if missing.
 */
function requireFields(...fields) {
  return (req, res, next) => {
    const missing = fields.filter((f) => req.body[f] === undefined || req.body[f] === null);
    if (missing.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missing.join(', ')}`,
      });
    }
    next();
  };
}

module.exports = { asyncHandler, errorHandler, requireFields };
