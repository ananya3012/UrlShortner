// src/utils/base62.js
// Base62 encoding/decoding for short URL generation

/**
 * ─── How Base62 Encoding Works ───────────────────────────────────────────────
 *
 * Base62 uses 62 characters: [0-9][A-Z][a-z]
 * This gives us 62^7 = ~3.5 trillion unique combinations for 7-char IDs.
 *
 * Algorithm (similar to converting a number to any base):
 *   1. Start with a large random integer
 *   2. Take integer % 62 → gives an index into the charset
 *   3. Append charset[index] to result
 *   4. Divide integer by 62 (floor)
 *   5. Repeat until we reach the desired length
 *
 * Example: encode(12345678) → "FPpco"
 *   12345678 % 62 = 44 → 'S'
 *   12345678 / 62 = 199123 → next iteration
 *   ...
 *
 * Why Base62 over UUID?
 *   - Shorter: 7 chars vs 36 chars
 *   - URL-safe: no special characters (+, /, =)
 *   - Human-readable and easy to share
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = CHARSET.length; // 62
const DEFAULT_LENGTH = parseInt(process.env.SHORT_ID_LENGTH) || 7;

/**
 * Encode a non-negative integer to Base62 string.
 * @param {number} num - Non-negative integer to encode
 * @returns {string} Base62 encoded string
 */
const encode = (num) => {
  if (num === 0) return CHARSET[0];
  let result = '';
  while (num > 0) {
    result = CHARSET[num % BASE] + result;
    num = Math.floor(num / BASE);
  }
  return result;
};

/**
 * Decode a Base62 string back to integer.
 * @param {string} str - Base62 encoded string
 * @returns {number} Decoded integer
 */
const decode = (str) => {
  return str.split('').reduce((acc, char) => {
    return acc * BASE + CHARSET.indexOf(char);
  }, 0);
};

/**
 * Generate a cryptographically random Base62 short ID.
 *
 * Strategy: Use crypto.getRandomValues for randomness, then map to Base62.
 * This avoids sequential IDs (which are guessable) and collision with counters.
 *
 * @param {number} length - Desired length of the short ID (default: 7)
 * @returns {string} Random Base62 string of the specified length
 */
const generateShortId = (length = DEFAULT_LENGTH) => {
  const crypto = require('crypto');
  let result = '';

  // Generate enough random bytes (1 byte → 1 char, slightly biased but fine for URLs)
  // For unbiased generation, use rejection sampling
  while (result.length < length) {
    const randomBytes = crypto.randomBytes(length * 2);
    for (let i = 0; i < randomBytes.length && result.length < length; i++) {
      // Rejection sampling: ignore bytes that would cause modulo bias
      // 256 / 62 = 4 full groups, so values 0-247 are unbiased
      if (randomBytes[i] < 248) {
        result += CHARSET[randomBytes[i] % BASE];
      }
    }
  }

  return result;
};

/**
 * Validate that a string is a valid Base62 short ID.
 * @param {string} str
 * @returns {boolean}
 */
const isValidShortId = (str) => {
  if (!str || typeof str !== 'string') return false;
  if (str.length < 4 || str.length > 12) return false;
  return /^[0-9A-Za-z]+$/.test(str);
};

module.exports = { encode, decode, generateShortId, isValidShortId, BASE, CHARSET };
