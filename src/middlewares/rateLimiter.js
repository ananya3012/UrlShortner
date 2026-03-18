// src/middlewares/rateLimiter.js
// Rate limiting to prevent abuse and DDoS

const rateLimit = require('express-rate-limit');

/**
 * General API rate limiter.
 * Applied to all routes.
 */
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,   // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,     // Disable X-RateLimit-* headers
  message: {
    success: false,
    error: 'Too many requests. Please try again later.',
  },
  // Skip rate limiting for health check endpoint
  skip: (req) => req.path === '/health',
});

/**
 * Stricter limiter for URL creation (POST /shorten).
 * Prevents bulk short URL generation / spam.
 */
const shortenLimiter = rateLimit({
  windowMs: 60 * 1000,     // 1 minute window
  max: 20,                  // Max 20 shortens per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many URL shortening requests. Please slow down.',
  },
});

module.exports = { apiLimiter, shortenLimiter };
