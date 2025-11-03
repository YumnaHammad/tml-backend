const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config(); // Load .env file

// Rate limiting middleware (optional - install: npm install express-rate-limit)
let rateLimit;
try {
  rateLimit = require('express-rate-limit');
} catch (e) {
  console.warn('express-rate-limit not installed. Run: npm install express-rate-limit for production safety.');
}

// Import route files
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const supplierRoutes = require('./routes/suppliers');
const salesRoutes = require('./routes/sales');
const purchaseRoutes = require('./routes/purchases');
const salesOrderRoutes = require('./routes/salesOrders');
const purchaseOrderRoutes = require('./routes/purchaseOrders');
const warehouseRoutes = require('./routes/warehouses');
const dispatchRoutes = require('./routes/dispatches');
const receiptRoutes = require('./routes/receipts');
const returnRoutes = require('./routes/returns');
const invoiceRoutes = require('./routes/invoices');
const stockRoutes = require('./routes/stock');
const userRoutes = require('./routes/users');
const dashboardRoutes = require('./routes/dashboard');
const reportRoutes = require('./routes/reports');
const cityReportRoutes = require('./routes/cityReports');
const expectedReturnRoutes = require('./routes/expectedReturns');
const customerRoutes = require('./routes/customers');

const app = express();
const PORT = process.env.PORT || 5000;

// --------------------
// 🧩 CORS Configuration
// --------------------
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.CORS_ORIGIN,
  'https://tml-frontend.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:5001',
  // 'http://localhost:5000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8080'
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    console.log('CORS request from origin:', origin);
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow all localhost origins (for local development)
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    console.warn('CORS blocked origin:', origin);
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true,
}));

app.use(express.json());

// --------------------------
// 🛡️ Rate Limiting (Protection against abuse)
// --------------------------
if (rateLimit) {
  // General API rate limit - Optimized for Vercel Free + Atlas M0 limits
  // Atlas M0: 100 ops/sec max, so we limit to 60 requests per minute per IP to stay safe
  const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute (shorter window for better UX)
    max: 60, // Limit each IP to 60 requests per minute (stays under Atlas 100 ops/sec limit)
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    skipSuccessfulRequests: false, // Count all requests
    skipFailedRequests: false, // Count failed requests too
  });

  // Stricter limit for write operations (create/update/delete)
  // Atlas M0 write operations are more limited, so we're more conservative
  const writeLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // Limit write operations to 30 per minute (conservative for free tier)
    message: 'Too many write requests, please try again later.',
  });

  // Apply general rate limiting to all API routes
  app.use('/api/', apiLimiter);
  
  // Apply stricter limits to write operations
  app.use('/api/sales', writeLimiter);
  app.use('/api/purchases', writeLimiter);
  app.use('/api/products', writeLimiter);
  app.use('/api/warehouses', writeLimiter);
} else {
  console.warn('⚠️ Rate limiting not enabled. Install express-rate-limit for production safety.');
}

// --------------------------
// 🧩 MongoDB Connection Setup
// --------------------------
const MONGODB_URI = process.env.MONGODB_URI;

// MongoDB connection optimized for Vercel Free + Atlas M0 Free Tier
// Atlas M0 allows: 500 connections, 100 ops/sec, 2GB storage
mongoose.connect(MONGODB_URI, {
  maxPoolSize: 50, // Optimized for Atlas M0 free tier (500 max) - conservative to avoid hitting limits
  minPoolSize: 5, // Keep minimum connections ready for faster responses
  serverSelectionTimeoutMS: 5000, // How long to try selecting a server
  socketTimeoutMS: 45000, // How long a send or receive on a socket can take before timeout
  connectTimeoutMS: 30000, // How long to wait for initial connection
  retryWrites: true, // Retry writes on network errors
  retryReads: true, // Retry reads on network errors
  serverApi: { version: '1', strict: false },
  // Heartbeat to keep connections alive in serverless
  heartbeatFrequencyMS: 10000, // Check connection health every 10 seconds
})
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// Enhanced connection error handling with exponential backoff
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected, attempting reconnect...');
  reconnectAttempts++;
  
  if (reconnectAttempts <= maxReconnectAttempts) {
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // Exponential backoff, max 30s
    setTimeout(() => {
      mongoose.connect(MONGODB_URI, {
        maxPoolSize: 50,
        minPoolSize: 5,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 30000,
        heartbeatFrequencyMS: 10000,
      })
        .then(() => {
          console.log('🔁 Reconnected to MongoDB');
          reconnectAttempts = 0; // Reset on successful reconnect
        })
        .catch((err) => {
          console.error(`❌ Reconnection failed (attempt ${reconnectAttempts}/${maxReconnectAttempts}):`, err);
        });
    }, delay);
  } else {
    console.error('❌ Max reconnection attempts reached. Please check MongoDB connection.');
  }
});

// Connection error handler
mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
});

// --------------------
// 🧩 API Route Mounting
// --------------------
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/sales-orders', salesOrderRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/warehouses', warehouseRoutes);
app.use('/api/dispatches', dispatchRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/stocks', stockRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/city-reports', cityReportRoutes);
app.use('/api/expected-returns', expectedReturnRoutes);
app.use('/api/customers', customerRoutes);

// --------------------
// 🩺 Health Check Route
// --------------------
app.get('/api/health', async (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = dbState === 1 ? 'connected' : 'disconnected';
  res.json({
    status: 'OK',
    message: 'Server running',
    database: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

// --------------------
// 🧩 Error Handlers
// --------------------
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message || 'Something went wrong',
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

// --------------------
// 🚀 Start Local Server
// --------------------
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📊 API endpoints available at http://localhost:${PORT}/api`);
    console.log(`🔧 Health check at http://localhost:${PORT}/api/health`);
  });
}

// Export for Vercel serverless
module.exports = app;

// --------------------
// 🧩 Exception Handlers
// --------------------
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
