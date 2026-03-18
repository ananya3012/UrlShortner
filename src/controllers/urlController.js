// src/controllers/urlController.js
// HTTP request handlers — thin layer that delegates to service layer

const { shortenUrl, resolveUrl, getUrlStats } = require('../services/urlService');

/**
 * POST /shorten
 * Accept a long URL and return a shortened URL.
 *
 * Request body:
 *   { url: string, ttlDays?: number }
 *
 * Response 201:
 *   { success: true, data: { shortId, shortUrl, originalUrl, expiresAt, isNew } }
 */
const shorten = async (req, res, next) => {
  try {
    const { url, ttlDays } = req.body;

    // Validate ttlDays if provided
    if (ttlDays !== undefined) {
      const days = Number(ttlDays);
      if (!Number.isInteger(days) || days < 0 || days > 3650) {
        return res.status(400).json({
          success: false,
          error: 'ttlDays must be an integer between 0 and 3650 (10 years)',
        });
      }
    }

    const result = await shortenUrl({
      originalUrl: url,
      ttlDays: ttlDays !== undefined ? Number(ttlDays) : undefined,
      createdByIp: req.ip,
    });

    return res.status(result.isNew ? 201 : 200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /:shortId
 * Redirect to the original URL associated with the short ID.
 *
 * Uses HTTP 302 (temporary redirect) instead of 301 (permanent):
 *   - 301 is cached by browsers indefinitely — if a URL expires or changes,
 *     users would still be redirected by their browser cache
 *   - 302 ensures every request goes through our server, so we can:
 *     (a) count clicks accurately
 *     (b) handle expiry correctly
 *     (c) update the destination if needed
 */
const redirect = async (req, res, next) => {
  try {
    const { shortId } = req.params;
    const originalUrl = await resolveUrl(shortId);

    // 302 Found — temporary redirect (see rationale above)
    return res.redirect(302, originalUrl);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /stats/:shortId
 * Return analytics for a short URL without redirecting.
 */
const stats = async (req, res, next) => {
  try {
    const { shortId } = req.params;
    const data = await getUrlStats(shortId);

    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = { shorten, redirect, stats };
