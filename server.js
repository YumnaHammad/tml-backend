const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
// Load environment variables
require('dotenv').config({ path: './env' });

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

// CORS - Smart configuration for both local and production
const allowedOrigins = [
  // Environment variable for frontend URL
  process.env.FRONTEND_URL,
  
  // Local development
  'http://localhost:3000', 
  'http://localhost:3001', 
  'http://localhost:5001',  // Local backend port
  'http://localhost:5001',  // Vite default port
  'http://localhost:5000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:5001',  // Local backend port
  'http://127.0.0.1:5173',  // Vite default port
  'http://127.0.0.1:8080'
].filter(Boolean); // Remove undefined values

app.use(cors({
  origin: function (origin, callback) {
    console.log('CORS request from origin:', origin);
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      console.log('No origin - allowing request');
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      console.log('Origin allowed:', origin);
      return callback(null, true);
    }
    
    // In development, allow any localhost origin
    if (process.env.NODE_ENV !== 'production' && origin.includes('localhost')) {
      console.log('Localhost origin allowed in development:', origin);
      return callback(null, true);
    }
    
    console.log('Origin blocked:', origin);
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

app.use(express.json());

// Handle preflight requests
app.options('*', cors());

// Additional CORS middleware for Vercel
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Use route files
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

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://inventory:leader12@cluster0.earrfsb.mongodb.net/inventory_system?retryWrites=true&w=majority';

// Database connection middleware for serverless functions
let isConnected = false;

async function connectToMongoDB() {
  if (isConnected) {
    console.log('✅ MongoDB already connected');
    return;
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,  // 30 seconds timeout
      socketTimeoutMS: 45000,           // 45 seconds socket timeout
      connectTimeoutMS: 30000,          // 30 seconds connection timeout
      maxPoolSize: 10,
      maxIdleTimeMS: 30000,             // 30 seconds idle timeout
      serverApi: { version: '1', strict: false },
      bufferCommands: false,            // Disable mongoose buffering
      bufferMaxEntries: 0,              // Disable buffering completely
      heartbeatFrequencyMS: 10000       // 10 seconds heartbeat
    });
    isConnected = true;
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB Error:', error.message);
    isConnected = false;
    // Don't throw error, just log it and continue
    console.log('⚠️ Continuing without database connection');
  }
}

// Database connection middleware - No timeout, always try to connect
app.use(async (req, res, next) => {
  try {
    if (!isConnected) {
      console.log('🔄 Attempting database connection...');
      await connectToMongoDB();
    }
    next();
  } catch (error) {
    console.error('Database connection failed:', error);
    // Continue without database - don't block API calls
    console.log('⚠️ Proceeding without database connection');
    next();
  }
});

// MongoDB connection event handlers
mongoose.connection.on('connected', () => {
  console.log('✅ MongoDB connected successfully');
  isConnected = true;
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
  isConnected = false;
  // Try to reconnect immediately
  setTimeout(() => {
    console.log('🔄 Attempting to reconnect to MongoDB...');
    connectToMongoDB();
  }, 1000);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected');
  isConnected = false;
  // Try to reconnect immediately
  setTimeout(() => {
    console.log('🔄 Attempting to reconnect to MongoDB...');
    connectToMongoDB();
  }, 1000);
});

// Keep connection alive - ping every 30 seconds
setInterval(() => {
  if (isConnected) {
    mongoose.connection.db.admin().ping((err, result) => {
      if (err) {
        console.log('⚠️ MongoDB ping failed, reconnecting...');
        isConnected = false;
        connectToMongoDB();
      } else {
        console.log('✅ MongoDB connection alive');
      }
    });
  }
}, 30000);

// Health check
app.get('/api/health', (req, res) => {
  const dbStatus = isConnected ? 'connected' : 'disconnected';
  res.json({ 
    status: 'OK', 
    message: 'Server running',
    database: dbStatus,
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: error.message || 'Something went wrong'
  });
});

// Handle 404 routes
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Start server (only for local development)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📊 API endpoints available at http://localhost:${PORT}/api`);
    console.log(`🔧 Health check at http://localhost:${PORT}/api/health`);
  });
}

// Export app for Vercel serverless functions
module.exports = app;

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
