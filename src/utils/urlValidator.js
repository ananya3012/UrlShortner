// src/utils/urlValidator.js
// URL validation and sanitization utilities

const validator = require('validator');

/**
 * Blocked URL patterns — prevent SSRF and abuse
 * In production, extend this list based on your threat model.
 */
const BLOCKED_PATTERNS = [
  /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|::1)/i, // Localhost
  /^https?:\/\/10\.\d+\.\d+\.\d+/i,                               // Private 10.x.x.x
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/i,              // Private 172.16-31.x.x
  /^https?:\/\/192\.168\.\d+\.\d+/i,                              // Private 192.168.x.x
  /^https?:\/\/169\.254\.\d+\.\d+/i,                              // Link-local
  /^https?:\/\/metadata\./i,                                       // Cloud metadata endpoints
];

const MAX_URL_LENGTH = 2048;

/**
 * Validate and normalize a URL for shortening.
 *
 * @param {string} url - The URL to validate
 * @returns {{ valid: boolean, url: string, error: string|null }}
 */
const validateUrl = (url) => {
  if (!url || typeof url !== 'string') {
    return { valid: false, url: null, error: 'URL is required' };
  }

  // Trim whitespace
  const trimmed = url.trim();

  if (trimmed.length === 0) {
    return { valid: false, url: null, error: 'URL cannot be empty' };
  }

  if (trimmed.length > MAX_URL_LENGTH) {
    return {
      valid: false,
      url: null,
      error: `URL exceeds maximum length of ${MAX_URL_LENGTH} characters`,
    };
  }

  // Auto-prepend https:// if protocol is missing
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  // Use validator.js for RFC-compliant URL validation
  const isValid = validator.isURL(normalized, {
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true,
    require_tld: true,
    allow_underscores: false,
  });

  if (!isValid) {
    return { valid: false, url: null, error: 'Invalid URL format' };
  }

  // SSRF protection: block private/internal addresses
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(normalized)) {
      return { valid: false, url: null, error: 'URL points to a restricted address' };
    }
  }

  return { valid: true, url: normalized, error: null };
};

/**
 * Generate a hash of a URL for duplicate detection.
 * Uses SHA-256 truncated to 16 hex chars (64-bit) for storage efficiency.
 *
 * @param {string} url
 * @returns {string} 16-character hex hash
 */
const hashUrl = (url) => {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
};

module.exports = { validateUrl, hashUrl };
