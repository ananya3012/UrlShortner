// src/middlewares/errorHandler.js
// Centralized error handling middleware

/**
 * Global error handler.
 * Converts errors into consistent JSON responses.
 *
 * Handles:
 *   - Application errors (with custom statusCode)
 *   - Mongoose validation errors
 *   - Mongoose duplicate key errors
 *   - Unexpected errors (500)
 */
const errorHandler = (err, req, res, next) => {
  // Log error details (in production, use a proper logger like Winston/Pino)
  if (process.env.NODE_ENV !== 'test') {
    console.error(`[ERROR] ${req.method} ${req.path}:`, {
      message: err.message,
      statusCode: err.statusCode,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }

  // ── Mongoose Validation Error ─────────────────────────────────────────────
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: messages,
    });
  }

  // ── Mongoose Duplicate Key Error ──────────────────────────────────────────
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      success: false,
      error: `Duplicate ${field}. Please try again.`,
    });
  }

  // ── Application Errors (with explicit statusCode) ─────────────────────────
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
  }

  // ── Unexpected Server Errors ──────────────────────────────────────────────
  return res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'An internal server error occurred'
      : err.message,
  });
};

/**
 * 404 handler for unmatched routes.
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
  });
};

module.exports = { errorHandler, notFoundHandler };
