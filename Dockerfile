# Dockerfile
# Multi-stage build for minimal production image

# ── Stage 1: Dependencies ──────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy package files first (layer caching — only re-runs npm install if these change)
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# ── Stage 2: Production Image ─────────────────────────────────────────────
FROM node:20-alpine AS production

# Security: run as non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

# Copy production node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY --chown=nodejs:nodejs src/ ./src/
COPY --chown=nodejs:nodejs package.json ./

USER nodejs

EXPOSE 3000

# Use node directly (not npm start) to receive OS signals for graceful shutdown
CMD ["node", "src/server.js"]
