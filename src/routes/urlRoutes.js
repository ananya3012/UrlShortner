// src/routes/urlRoutes.js
// API route definitions

const express = require('express');
const router = express.Router();
const { shorten, redirect, stats } = require('../controllers/urlController');
const { isValidShortId } = require('../utils/base62');

// ─── Middleware: Validate shortId format ─────────────────────────────────────
const validateShortIdParam = (req, res, next) => {
  if (!isValidShortId(req.params.shortId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid short ID format',
    });
  }
  next();
};

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /shorten
 * Create a new short URL
 *
 * Body: { url: string, ttlDays?: number }
 */
router.post('/shorten', shorten);

/**
 * GET /stats/:shortId
 * Get analytics for a short URL
 * (Must be defined BEFORE /:shortId to avoid route conflict)
 */
router.get('/stats/:shortId', validateShortIdParam, stats);

/**
 * GET /:shortId
 * Redirect to original URL
 */
router.get('/:shortId', validateShortIdParam, redirect);

module.exports = router;
