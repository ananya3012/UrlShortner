// src/services/urlService.js
// Core business logic for URL shortening and resolution

const Url = require('../models/Url');
const { generateShortId } = require('../utils/base62');
const { validateUrl, hashUrl } = require('../utils/urlValidator');
const { getCachedUrl, setCachedUrl, invalidateCache } = require('./cacheService');

const MAX_COLLISION_RETRIES = 5;
const DEFAULT_TTL_DAYS = parseInt(process.env.DEFAULT_TTL_DAYS) || 365;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/**
 * Shorten a long URL.
 *
 * Flow:
 *   1. Validate the input URL
 *   2. Check for existing mapping (deduplication)
 *   3. Generate unique Base62 short ID (with collision retry)
 *   4. Persist to MongoDB
 *   5. Pre-populate Redis cache
 *
 * @param {object} options
 * @param {string} options.originalUrl - The long URL to shorten
 * @param {number} [options.ttlDays] - Optional expiry in days (0 = never)
 * @param {string} [options.createdByIp] - Client IP for tracking
 * @returns {Promise<{ shortId, shortUrl, originalUrl, expiresAt, isNew }>}
 */
const shortenUrl = async ({ originalUrl, ttlDays, createdByIp }) => {
  // ── Step 1: Validate URL ──────────────────────────────────────────────────
  const { valid, url: normalizedUrl, error } = validateUrl(originalUrl);
  if (!valid) {
    const err = new Error(error);
    err.statusCode = 400;
    throw err;
  }

  // ── Step 2: Duplicate Detection ───────────────────────────────────────────
  const urlHash = hashUrl(normalizedUrl);
  const existing = await Url.findOne({ urlHash, isActive: true });

  if (existing && !existing.isExpired()) {
    // Return existing short URL — no new DB entry needed
    return {
      shortId: existing.shortId,
      shortUrl: `${BASE_URL}/${existing.shortId}`,
      originalUrl: existing.originalUrl,
      expiresAt: existing.expiresAt,
      clicks: existing.clicks,
      isNew: false,
    };
  }

  // ── Step 3: Generate Unique Short ID ──────────────────────────────────────
  let shortId;
  let attempts = 0;

  while (attempts < MAX_COLLISION_RETRIES) {
    const candidate = generateShortId();

    // Check for collision in DB (extremely rare with 7-char Base62 = 3.5T combos)
    const collision = await Url.findOne({ shortId: candidate });
    if (!collision) {
      shortId = candidate;
      break;
    }

    attempts++;
    console.warn(`Short ID collision detected (attempt ${attempts}): ${candidate}`);
  }

  if (!shortId) {
    const err = new Error('Failed to generate unique short ID after retries');
    err.statusCode = 500;
    throw err;
  }

  // ── Step 4: Calculate Expiry ──────────────────────────────────────────────
  let expiresAt = null;
  const daysToExpire = ttlDays !== undefined ? ttlDays : DEFAULT_TTL_DAYS;

  if (daysToExpire > 0) {
    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + daysToExpire);
  }

  // ── Step 5: Persist to MongoDB ────────────────────────────────────────────
  const urlDoc = await Url.create({
    shortId,
    originalUrl: normalizedUrl,
    urlHash,
    expiresAt,
    createdByIp,
  });

  // ── Step 6: Pre-warm Cache ────────────────────────────────────────────────
  // Cache TTL = min(URL expiry remaining, default cache TTL)
  let cacheTtl = parseInt(process.env.CACHE_TTL_SECONDS) || 3600;
  if (expiresAt) {
    const secondsUntilExpiry = Math.floor((expiresAt - Date.now()) / 1000);
    cacheTtl = Math.min(cacheTtl, secondsUntilExpiry);
  }
  await setCachedUrl(shortId, normalizedUrl, cacheTtl);

  return {
    shortId: urlDoc.shortId,
    shortUrl: `${BASE_URL}/${urlDoc.shortId}`,
    originalUrl: urlDoc.originalUrl,
    expiresAt: urlDoc.expiresAt,
    clicks: 0,
    isNew: true,
  };
};

/**
 * Resolve a short ID to its original URL.
 *
 * Flow (optimized for minimum latency):
 *   1. Check Redis cache (~0.1ms) — cache HIT returns immediately
 *   2. On miss, query MongoDB (~5-20ms)
 *   3. Populate cache for future requests
 *   4. Async click counter increment (non-blocking)
 *
 * @param {string} shortId
 * @returns {Promise<string>} The original URL to redirect to
 */
const resolveUrl = async (shortId) => {
  // ── Step 1: Cache Lookup (Hot Path) ───────────────────────────────────────
  const cachedUrl = await getCachedUrl(shortId);
  if (cachedUrl) {
    // Fire-and-forget click increment — doesn't block redirect
    Url.findOneAndUpdate({ shortId }, { $inc: { clicks: 1 } }).catch(() => {});
    return cachedUrl;
  }

  // ── Step 2: Database Lookup (Cache Miss) ──────────────────────────────────
  const urlDoc = await Url.findByShortId(shortId);

  if (!urlDoc) {
    const err = new Error('Short URL not found');
    err.statusCode = 404;
    throw err;
  }

  // Double-check expiry (MongoDB TTL index has ~60s resolution)
  if (urlDoc.isExpired()) {
    await invalidateCache(shortId); // Ensure cache is clean
    const err = new Error('This short URL has expired');
    err.statusCode = 410; // HTTP 410 Gone — semantically correct for expired content
    throw err;
  }

  // ── Step 3: Populate Cache ────────────────────────────────────────────────
  let cacheTtl = parseInt(process.env.CACHE_TTL_SECONDS) || 3600;
  if (urlDoc.expiresAt) {
    const secondsUntilExpiry = Math.floor((urlDoc.expiresAt - Date.now()) / 1000);
    cacheTtl = Math.min(cacheTtl, Math.max(secondsUntilExpiry, 0));
  }

  if (cacheTtl > 0) {
    await setCachedUrl(shortId, urlDoc.originalUrl, cacheTtl);
  }

  // ── Step 4: Async Click Increment ─────────────────────────────────────────
  Url.findOneAndUpdate({ shortId }, { $inc: { clicks: 1 } }).catch(() => {});

  return urlDoc.originalUrl;
};

/**
 * Get analytics for a short URL (optional stats endpoint).
 * @param {string} shortId
 * @returns {Promise<object>}
 */
const getUrlStats = async (shortId) => {
  const urlDoc = await Url.findOne({ shortId, isActive: true });

  if (!urlDoc) {
    const err = new Error('Short URL not found');
    err.statusCode = 404;
    throw err;
  }

  return {
    shortId: urlDoc.shortId,
    shortUrl: `${BASE_URL}/${urlDoc.shortId}`,
    originalUrl: urlDoc.originalUrl,
    clicks: urlDoc.clicks,
    createdAt: urlDoc.createdAt,
    expiresAt: urlDoc.expiresAt,
    isExpired: urlDoc.isExpired(),
  };
};

module.exports = { shortenUrl, resolveUrl, getUrlStats };
