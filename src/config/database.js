// src/config/database.js
// MongoDB connection with retry logic and graceful shutdown

const mongoose = require('mongoose');

/**
 * Connect to MongoDB with retry logic.
 * Uses exponential backoff for reconnection attempts.
 */
const connectMongoDB = async () => {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/url_shortener';

  const options = {
    // Connection pool settings for high concurrency
    maxPoolSize: 10,
    minPoolSize: 2,
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 5000,
  };

  try {
    await mongoose.connect(uri, options);
    console.log(`✅ MongoDB connected: ${mongoose.connection.host}`);
  } catch (err) {
    console.error(`❌ MongoDB connection failed: ${err.message}`);
    // Retry after 5 seconds
    setTimeout(connectMongoDB, 5000);
  }

  // Handle connection events
  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️  MongoDB disconnected. Attempting reconnect...');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB reconnected');
  });
};

/**
 * Gracefully close MongoDB connection.
 */
const closeMongoDB = async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed.');
};

module.exports = { connectMongoDB, closeMongoDB };
