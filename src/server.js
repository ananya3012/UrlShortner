// src/server.js
// Application entry point — bootstraps connections and starts the HTTP server

require('dotenv').config();

const createApp = require('./app');
const { connectMongoDB, closeMongoDB } = require('./config/database');
const { connectRedis, closeRedis } = require('./config/redis');

const PORT = process.env.PORT || 3000;

const start = async () => {
  try {
    // ── Connect to Data Stores ──────────────────────────────────────────────
    await connectMongoDB();
    await connectRedis(); // Non-fatal if Redis is unavailable

    // ── Start HTTP Server ───────────────────────────────────────────────────
    const app = createApp();
    const server = app.listen(PORT, () => {
      console.log(`\n🚀 URL Shortener Service running on port ${PORT}`);
      console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
      console.log(`   Base URL    : ${process.env.BASE_URL || `http://localhost:${PORT}`}`);
      console.log(`   Health      : http://localhost:${PORT}/health\n`);
    });

    // ── Graceful Shutdown ───────────────────────────────────────────────────
    // Handles SIGTERM (Docker/K8s stop) and SIGINT (Ctrl+C)
    const shutdown = async (signal) => {
      console.log(`\n${signal} received. Starting graceful shutdown...`);

      server.close(async () => {
        console.log('HTTP server closed.');
        await closeMongoDB();
        await closeRedis();
        console.log('Shutdown complete.');
        process.exit(0);
      });

      // Force exit after 10 seconds if graceful shutdown hangs
      setTimeout(() => {
        console.error('Forced shutdown after timeout.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors — log and exit so process manager can restart
    process.on('uncaughtException', (err) => {
      console.error('Uncaught Exception:', err);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled Rejection:', reason);
      process.exit(1);
    });

    return server;
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

start();
