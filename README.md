# URL Shortener Service

A production-ready URL shortener built with **Node.js**, **Express**, **MongoDB**, and **Redis**. Generates compact Base62-encoded short IDs, serves redirects with sub-millisecond cache hits, and handles high concurrency cleanly.

---

## Table of Contents

1. [Features](#features)
2. [Architecture Overview](#architecture-overview)
3. [Project Structure](#project-structure)
4. [Step-by-Step Setup](#step-by-step-setup)
5. [API Reference](#api-reference)
6. [How Base62 Encoding Works](#how-base62-encoding-works)
7. [Scalability Considerations](#scalability-considerations)
8. [Database Schema](#database-schema)
9. [Redis Caching Strategy](#redis-caching-strategy)

---

## Features

- **URL Shortening** — POST a long URL, get a 7-char Base62 short ID back
- **Fast Redirects** — Redis cache-aside pattern keeps hot URLs sub-millisecond
- **Deduplication** — Same URL always returns the same short link (SHA-256 hash check)
- **Expiry Support** — Optional TTL per link; MongoDB TTL index auto-purges expired docs
- **Click Analytics** — Atomic counter increments per redirect
- **URL Validation** — RFC-compliant checks + SSRF protection (blocks private IPs)
- **Rate Limiting** — Per-IP limits on both general API and `/shorten` endpoint
- **Graceful Shutdown** — Drains in-flight requests before closing DB/Redis connections
- **Health Check** — `GET /health` for load balancer / container probes

---

## Architecture Overview

```
Client
  │
  ▼
Express (Node.js)
  │
  ├─── POST /shorten ──► Validate URL ──► Hash check (MongoDB) ──► Generate Base62 ID
  │                                                                        │
  │                                                                  Save to MongoDB
  │                                                                  Pre-warm Redis
  │
  └─── GET /:shortId ──► Redis lookup ──► HIT: redirect immediately (< 1ms)
                                │
                               MISS
                                │
                           MongoDB lookup (~10ms)
                                │
                          Populate Redis cache
                                │
                          Async click increment
                                │
                           302 Redirect
```

**Why 302 not 301?**  
HTTP 301 (permanent redirect) is cached by browsers indefinitely. If a URL expires or needs to change destination, users with a cached 301 would bypass your server entirely. HTTP 302 ensures every redirect flows through your service — enabling click tracking, expiry enforcement, and future destination updates.

---

## Project Structure

```
url-shortener/
├── src/
│   ├── config/
│   │   ├── database.js        # MongoDB connection + retry logic
│   │   └── redis.js           # Redis client + graceful degradation
│   ├── controllers/
│   │   └── urlController.js   # Thin HTTP handlers (delegates to services)
│   ├── middlewares/
│   │   ├── errorHandler.js    # Centralized error → JSON response
│   │   └── rateLimiter.js     # Per-IP rate limiting
│   ├── models/
│   │   └── Url.js             # Mongoose schema + indexes + methods
│   ├── routes/
│   │   └── urlRoutes.js       # Route definitions
│   ├── services/
│   │   ├── cacheService.js    # Redis cache-aside operations
│   │   └── urlService.js      # Core business logic
│   ├── utils/
│   │   ├── base62.js          # Encoding/decoding + ID generation
│   │   └── urlValidator.js    # URL validation + SSRF protection
│   ├── app.js                 # Express factory (middleware stack)
│   └── server.js              # Entry point (bootstrap + graceful shutdown)
├── tests/
│   └── unit.test.js           # Unit tests for utils
├── .env.example
├── docker-compose.yml
├── Dockerfile
└── package.json
```

---

## Step-by-Step Setup

### Option A: Docker Compose (Recommended — zero local dependencies)

```bash
# 1. Clone the repo
git clone <repo-url>
cd url-shortener

# 2. Copy environment file
cp .env.example .env

# 3. Start everything (app + MongoDB + Redis)
docker-compose up -d

# 4. Verify it's running
curl http://localhost:3000/health
# → {"status":"healthy","timestamp":"...","uptime":3}

# 5. Shorten your first URL
curl -X POST http://localhost:3000/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.example.com/very/long/path?q=123"}'
```

### Option B: Local Development (requires Node 18+, MongoDB, Redis)

```bash
# 1. Install dependencies
npm install

# 2. Start MongoDB (if not already running)
mongod --dbpath /usr/local/var/mongodb

# 3. Start Redis
redis-server

# 4. Configure environment
cp .env.example .env
# Edit .env — set MONGO_URI and REDIS_HOST if needed

# 5. Start in dev mode (auto-restart on changes)
npm run dev

# 6. Run tests
npm test
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | `development` | Environment (`development`/`production`/`test`) |
| `BASE_URL` | `http://localhost:3000` | Public base URL for generating short links |
| `MONGO_URI` | `mongodb://localhost:27017/url_shortener` | MongoDB connection string |
| `REDIS_HOST` | `localhost` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | _(empty)_ | Redis password |
| `SHORT_ID_LENGTH` | `7` | Length of generated short IDs |
| `DEFAULT_TTL_DAYS` | `365` | Default link expiry in days (0 = never) |
| `CACHE_TTL_SECONDS` | `3600` | Redis cache TTL in seconds |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per 15 min per IP |

---

## API Reference

### `POST /shorten`

Create a short URL.

**Request**
```json
{
  "url": "https://www.example.com/very/long/path?with=query&params=here",
  "ttlDays": 30
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `url` | string | ✅ | Long URL to shorten (http/https) |
| `ttlDays` | integer | ❌ | Expiry in days (0 = never, default = 365) |

**Response 201 (new link created)**
```json
{
  "success": true,
  "data": {
    "shortId": "aB3xY7z",
    "shortUrl": "http://localhost:3000/aB3xY7z",
    "originalUrl": "https://www.example.com/very/long/path?with=query&params=here",
    "expiresAt": "2026-04-18T12:00:00.000Z",
    "clicks": 0,
    "isNew": true
  }
}
```

**Response 200 (duplicate — returning existing link)**
```json
{
  "success": true,
  "data": {
    "shortId": "aB3xY7z",
    "shortUrl": "http://localhost:3000/aB3xY7z",
    "originalUrl": "https://www.example.com/very/long/path?with=query&params=here",
    "expiresAt": "2026-04-18T12:00:00.000Z",
    "clicks": 42,
    "isNew": false
  }
}
```

**Error Responses**
```json
{ "success": false, "error": "Invalid URL format" }               // 400
{ "success": false, "error": "URL points to a restricted address" } // 400
{ "success": false, "error": "Too many requests..." }              // 429
```

---

### `GET /:shortId`

Redirect to the original URL.

**Response:** `302 Found` with `Location` header set to the original URL.

**Error Responses**
```json
{ "success": false, "error": "Short URL not found" }      // 404
{ "success": false, "error": "This short URL has expired" } // 410
{ "success": false, "error": "Invalid short ID format" }   // 400
```

---

### `GET /stats/:shortId`

Retrieve analytics without redirecting.

**Response 200**
```json
{
  "success": true,
  "data": {
    "shortId": "aB3xY7z",
    "shortUrl": "http://localhost:3000/aB3xY7z",
    "originalUrl": "https://www.example.com/very/long/path",
    "clicks": 1337,
    "createdAt": "2026-03-19T10:00:00.000Z",
    "expiresAt": "2027-03-19T10:00:00.000Z",
    "isExpired": false
  }
}
```

### `GET /health`

Health check for load balancers and container orchestration.

```json
{ "status": "healthy", "timestamp": "2026-03-19T10:00:00.000Z", "uptime": 3600 }
```

---

## How Base62 Encoding Works

Base62 uses exactly **62 characters**: digits `0–9`, uppercase `A–Z`, and lowercase `a–z`.

### Why Base62?

| Encoding | Characters | 7-char combinations | URL-safe |
|---|---|---|---|
| Base10 (numeric) | 10 | 10,000,000 | ✅ |
| Base16 (hex) | 16 | 268 million | ✅ |
| **Base62** | **62** | **~3.5 trillion** | **✅** |
| Base64 | 64 | ~4 trillion | ❌ (`+`, `/`, `=`) |

Base62 gives us the density of Base64 without URL-unsafe characters — the sweet spot for short IDs.

### The Algorithm

```
encode(12345678):

  Step 1: 12345678 % 62 = 44  → charset[44] = 'S'
          12345678 / 62 = 199123

  Step 2: 199123 % 62 = 51    → charset[51] = 'p'
          199123 / 62 = 3211

  Step 3: 3211 % 62 = 21      → charset[21] = 'L'
          3211 / 62 = 51

  Step 4: 51 % 62 = 51        → charset[51] = 'p'
          51 / 62 = 0  → stop

  Result: "pLpS" (reversed as we build)
```

### ID Generation Strategy

Rather than encoding a sequential counter (which would be guessable), this service uses **cryptographically random bytes** mapped to Base62 characters with rejection sampling (eliminating modulo bias). This means:

- IDs are unpredictable and non-enumerable
- No coordination between servers needed
- Collision probability ≈ 1 in 3.5 trillion per generation

---

## Scalability Considerations

### 1. Redis Cache-Aside (Hot Path)

The redirect path is the highest-traffic endpoint. By caching `shortId → originalUrl` in Redis:

- **Cache hit**: ~0.1ms (Redis in-memory lookup)
- **Cache miss**: ~10-20ms (MongoDB query, then cache populate)

For a service with millions of daily redirects, most URLs quickly become "hot" and are served entirely from Redis. MongoDB is only hit on cold starts or new URLs.

### 2. MongoDB Indexing Strategy

```
shortId        → unique index    (primary redirect lookup)
urlHash        → index           (duplicate detection on POST)
urlHash+active → compound index  (dedup query: hash + isActive filter)
expiresAt      → TTL index       (auto-delete expired docs — no cron needed)
```

The `shortId` index is the most critical — it's hit on every single redirect.

### 3. Async Click Counting

Click increments are fire-and-forget (`findOneAndUpdate` without await on the hot path). The redirect responds immediately; the counter update happens in the background. This trades perfect click accuracy for lower latency — an acceptable tradeoff for analytics.

For higher accuracy at scale, consider buffering click counts in Redis (`INCR`) and flushing to MongoDB in periodic batches.

### 4. Horizontal Scaling

The service is **stateless** — all state lives in MongoDB and Redis. You can run N instances behind a load balancer with no coordination needed:

```
                        ┌─── App Instance 1 ───┐
Client → Load Balancer ─├─── App Instance 2 ───┤─── MongoDB (replica set)
                        └─── App Instance 3 ───┘─── Redis (cluster/sentinel)
```

### 5. MongoDB Replica Set

For production, use a 3-node MongoDB replica set:
- Primary handles writes
- Secondaries handle read scaling
- Automatic failover if primary goes down

### 6. Redis High Availability

Use **Redis Sentinel** (automatic failover) or **Redis Cluster** (sharding across nodes) for production. The `redis` client in this service supports both via the `REDIS_URL` environment variable.

### 7. Collision Probability

With 7-char Base62 IDs (62^7 ≈ 3.5 trillion combinations):

| URLs in system | Collision probability |
|---|---|
| 1 million | ~0.000014% |
| 1 billion | ~14% |
| 3.5 trillion | ~63% (birthday problem) |

For most services, 7 characters is sufficient. Increase `SHORT_ID_LENGTH` to 8–10 for larger scale.

### 8. Rate Limiting

Current limits (configurable via env):
- General API: 100 requests / 15 min / IP
- POST /shorten: 20 requests / 1 min / IP

In production, move rate limiting to a Redis-backed store (e.g., `rate-limit-redis`) so limits are enforced across all instances, not just per-process.

---

## Database Schema

```js
{
  shortId:      String,   // "aB3xY7z"  — unique, indexed
  originalUrl:  String,   // "https://..."
  urlHash:      String,   // SHA-256 truncated to 16 hex chars — indexed for dedup
  clicks:       Number,   // 0 — atomic increment on each redirect
  expiresAt:    Date,     // null = never; MongoDB TTL index auto-deletes expired docs
  createdByIp:  String,   // "203.0.113.1" — for abuse tracking
  isActive:     Boolean,  // true — soft delete support
  createdAt:    Date,     // auto (mongoose timestamps)
  updatedAt:    Date,     // auto (mongoose timestamps)
}
```

**Indexes:**
- `shortId` — unique (redirect lookup)
- `urlHash` — (duplicate check)
- `{ urlHash, isActive }` — compound (dedup query)
- `expiresAt` — TTL (auto-purge)

---

## Redis Caching Strategy

```
Key format:    url:{shortId}
Value:         originalUrl (plain string)
TTL:           min(env CACHE_TTL_SECONDS, seconds until URL expiry)

Pipeline:      Multi-key warmup uses Redis MULTI/EXEC for atomic batch writes
Degradation:   If Redis is down, all reads fall through to MongoDB — no crash
Invalidation:  Cache entry deleted on URL soft-delete or confirmed expiry
```
