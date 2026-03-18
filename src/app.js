// src/app.js
// Express application factory — separated from server.js for testability

const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');

const urlRoutes = require('./routes/urlRoutes');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');
const { apiLimiter, shortenLimiter } = require('./middlewares/rateLimiter');

const createApp = () => {
  const app = express();

  // ── Security Headers ────────────────────────────────────────────────────
  // Helmet sets various HTTP headers to protect against common attacks
  app.use(helmet());

  // ── Trust Proxy ─────────────────────────────────────────────────────────
  // Required for accurate IP detection behind load balancers / nginx
  app.set('trust proxy', 1);

  // ── Body Parsing ─────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10kb' }));       // Limit request body size
  app.use(express.urlencoded({ extended: false }));

  // ── HTTP Request Logging ─────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  }

  // ── Rate Limiting ─────────────────────────────────────────────────────────
  app.use(apiLimiter);
  app.use('/shorten', shortenLimiter);

  // ── Health Check ──────────────────────────────────────────────────────────
  app.get('/', (req, res) => {
    res.status(200).json({ message: 'URL Shortener API is running 🚀' });
  });

  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    });
  });

  // ── API Routes ────────────────────────────────────────────────────────────
  app.use('/', urlRoutes);

  // ── 404 Handler ───────────────────────────────────────────────────────────
  app.use(notFoundHandler);

  // ── Global Error Handler (must be last) ───────────────────────────────────
  app.use(errorHandler);

  return app;
};

module.exports = createApp;
