// src/models/Url.js
// MongoDB schema for URL mappings

const mongoose = require('mongoose');

/**
 * URL Schema
 *
 * Stores the mapping between short IDs and original long URLs.
 * Indexed for high-performance lookups on the hot path (GET /:shortId).
 */
const urlSchema = new mongoose.Schema(
  {
    // The 7-character Base62 short identifier (e.g., "aB3xY7z")
    shortId: {
      type: String,
      required: true,
      unique: true,
      index: true,          // Primary lookup index — critical for redirection performance
      trim: true,
      minlength: 4,
      maxlength: 12,
    },

    // The original long URL
    originalUrl: {
      type: String,
      required: true,
      trim: true,
    },

    // Optional: URL alias for duplicate detection
    // Hashed for fast equality checks without storing raw URL twice
    urlHash: {
      type: String,
      index: true,          // Used for duplicate detection (POST /shorten)
    },

    // Click analytics counter (atomic increments)
    clicks: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Optional expiry date (null = never expires)
    expiresAt: {
      type: Date,
      default: null,
      index: { expireAfterSeconds: 0 }, // MongoDB TTL index — auto-deletes expired docs
    },

    // Creator IP for rate limiting and abuse tracking
    createdByIp: {
      type: String,
      default: null,
    },

    // Whether this URL is active (soft-delete support)
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,         // Adds createdAt and updatedAt automatically
    versionKey: false,        // Remove __v field
  }
);

// ─── Compound Indexes ────────────────────────────────────────────────────────

// Speeds up the duplicate-check query: find active URLs by hash
urlSchema.index({ urlHash: 1, isActive: 1 });

// ─── Instance Methods ─────────────────────────────────────────────────────────

/**
 * Check if this URL mapping has expired.
 * @returns {boolean}
 */
urlSchema.methods.isExpired = function () {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
};

/**
 * Increment click counter atomically.
 * Uses findOneAndUpdate to avoid race conditions under high concurrency.
 */
urlSchema.methods.incrementClicks = async function () {
  await this.constructor.findOneAndUpdate(
    { _id: this._id },
    { $inc: { clicks: 1 } }
  );
};

// ─── Static Methods ───────────────────────────────────────────────────────────

/**
 * Find an active, non-expired URL by shortId.
 * This is the HOT PATH — called on every redirect.
 * @param {string} shortId
 * @returns {Promise<UrlDocument|null>}
 */
urlSchema.statics.findByShortId = function (shortId) {
  return this.findOne({
    shortId,
    isActive: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  });
};

const Url = mongoose.model('Url', urlSchema);

module.exports = Url;
