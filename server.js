const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config(); // Load .env file

// Rate limiting middleware (optional - install: npm install express-rate-limit)
let rateLimit;
try {
  rateLimit = require("express-rate-limit");
} catch (e) {
  console.warn(
    "express-rate-limit not installed. Run: npm install express-rate-limit for production safety."
  );
}

// Import route files
<<<<<<< HEAD
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
const postExRoutes = require('./routes/postEx');
const oldCrmRoutes = require('./routes/oldCrm');

// Load Chatwoot routes with error handling
let chatwootRoutes;
try {
  chatwootRoutes = require('./routes/chatwoot');
  console.log('✅ Chatwoot routes loaded successfully');
} catch (error) {
  console.error('❌ Error loading Chatwoot routes:', error);
  // Create a dummy router to prevent server crash
  chatwootRoutes = require('express').Router();
  chatwootRoutes.get('*', (req, res) => {
    res.status(500).json({ error: 'Chatwoot routes failed to load', details: error.message });
  });
}
=======
const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const supplierRoutes = require("./routes/suppliers");
const salesRoutes = require("./routes/sales");
const purchaseRoutes = require("./routes/purchases");
const salesOrderRoutes = require("./routes/salesOrders");
const purchaseOrderRoutes = require("./routes/purchaseOrders");
const warehouseRoutes = require("./routes/warehouses");
const dispatchRoutes = require("./routes/dispatches");
const receiptRoutes = require("./routes/receipts");
const returnRoutes = require("./routes/returns");
const invoiceRoutes = require("./routes/invoices");
const stockRoutes = require("./routes/stock");
const userRoutes = require("./routes/users");
const dashboardRoutes = require("./routes/dashboard");
const reportRoutes = require("./routes/reports");
const cityReportRoutes = require("./routes/cityReports");
const expectedReturnRoutes = require("./routes/expectedReturns");
const customerRoutes = require("./routes/customers");
const postExRoutes = require("./routes/postEx");
>>>>>>> cde4671297590b3067ca11211b1e4e77c1c218e1

const app = express();
const PORT = process.env.PORT || 5000;

// --------------------
// 🧩 CORS Configuration
// --------------------
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.CORS_ORIGIN,
  "https://tml-frontend.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:5001",
  // 'http://localhost:5000',
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:3002",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8080",
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      console.log("CORS request from origin:", origin);
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      // Allow all localhost origins (for local development)
      if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
        return callback(null, true);
      }

      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn("CORS blocked origin:", origin);
      callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
    credentials: true,
  })
);

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
    message: "Too many requests from this IP, please try again later.",
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
    message: "Too many write requests, please try again later.",
  });

  // Apply general rate limiting to all API routes
  app.use("/api/", apiLimiter);

  // Apply stricter limits to write operations
  app.use("/api/sales", writeLimiter);
  app.use("/api/purchases", writeLimiter);
  app.use("/api/products", writeLimiter);
  app.use("/api/warehouses", writeLimiter);
} else {
  console.warn(
    "⚠️ Rate limiting not enabled. Install express-rate-limit for production safety."
  );
}

// --------------------------
// 🧩 MongoDB Connection Setup
// --------------------------
const MONGODB_URI = process.env.MONGODB_URI;

// MongoDB connection optimized for Vercel Free + Atlas M0 Free Tier
// Atlas M0 allows: 500 connections, 100 ops/sec, 2GB storage
mongoose
  .connect(MONGODB_URI, {
    maxPoolSize: 50, // Optimized for Atlas M0 free tier (500 max) - conservative to avoid hitting limits
    minPoolSize: 5, // Keep minimum connections ready for faster responses
    serverSelectionTimeoutMS: 5000, // How long to try selecting a server
    socketTimeoutMS: 45000, // How long a send or receive on a socket can take before timeout
    connectTimeoutMS: 30000, // How long to wait for initial connection
    retryWrites: true, // Retry writes on network errors
    retryReads: true, // Retry reads on network errors
    serverApi: { version: "1", strict: false },
    // Heartbeat to keep connections alive in serverless
    heartbeatFrequencyMS: 10000, // Check connection health every 10 seconds
  })
  .then(() => console.log("✅ MongoDB connected successfully"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Enhanced connection error handling with exponential backoff
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

mongoose.connection.on("disconnected", () => {
  console.log("⚠️ MongoDB disconnected, attempting reconnect...");
  reconnectAttempts++;

  if (reconnectAttempts <= maxReconnectAttempts) {
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // Exponential backoff, max 30s
    setTimeout(() => {
      mongoose
        .connect(MONGODB_URI, {
          maxPoolSize: 50,
          minPoolSize: 5,
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
          connectTimeoutMS: 30000,
          heartbeatFrequencyMS: 10000,
        })
        .then(() => {
          console.log("🔁 Reconnected to MongoDB");
          reconnectAttempts = 0; // Reset on successful reconnect
        })
        .catch((err) => {
          console.error(
            `❌ Reconnection failed (attempt ${reconnectAttempts}/${maxReconnectAttempts}):`,
            err
          );
        });
    }, delay);
  } else {
    console.error(
      "❌ Max reconnection attempts reached. Please check MongoDB connection."
    );
  }
});

// Connection error handler
mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB connection error:", err);
});

// --------------------
// 🧩 API Route Mounting
// --------------------
<<<<<<< HEAD
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
app.use('/api/postex', postExRoutes);
app.use('/api/old-crm', oldCrmRoutes);
app.use('/api/chatwoot', chatwootRoutes);
=======
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/sales-orders", salesOrderRoutes);
app.use("/api/purchase-orders", purchaseOrderRoutes);
app.use("/api/warehouses", warehouseRoutes);
app.use("/api/dispatches", dispatchRoutes);
app.use("/api/receipts", receiptRoutes);
app.use("/api/returns", returnRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/stocks", stockRoutes);
app.use("/api/users", userRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/city-reports", cityReportRoutes);
app.use("/api/expected-returns", expectedReturnRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/postex", postExRoutes);
>>>>>>> cde4671297590b3067ca11211b1e4e77c1c218e1

// route  for postEX  webhook
app.post("/webhook/postex-updates", async (req, res) => {
  try {
    // Log all incoming headers for debugging
    console.log("Received webhook with headers:", req.headers);
    console.log("Received webhook body:", req.body);

    // Process the webhook data
    const webhookData = req.body;
    const {
      trackingNumber,
      orderReferenceNumber,
      orderStatus,
      statusUpdateDatetime,
      returnRequested,
      lastAttemptReason,
    } = webhookData;

    // Validate required fields
    if (!trackingNumber || !orderStatus) {
      console.warn("Missing required fields in webhook:", webhookData);
      return res.status(400).json({
        status: "error",
        message: "Missing required fields: trackingNumber or orderStatus",
      });
    }

    // Import required models
    const { SalesOrder, Warehouse, StockMovement } = require("./models");
    const { createAuditLog } = require("./middleware/audit");

    // Map PostEx orderStatus to internal status values
    const statusMap = {
      Delivered: "Delivered",
      "Out For Delivery": "OutForDelivery",
      Booked: "Booked",
      Unbooked: "Unbooked",
      "Picked By PostEx": "PickedByPostEx",
      "En-Route to PostEx warehouse": "EnRouteToPostExwarehouse",
      "PostEx WareHouse": "PostExWareHouse",
      Returned: "Returned",
      "Out For Return": "OutForReturn",
      Attempted: "Attempted",
      "Delivery Under Review": "DeliveryUnderReview",
      Expired: "Expired",
      "Un-Assigned By Me": "UnAssignedByMe",
      Cancelled: "cancelled",
    };

    const internalStatus = statusMap[orderStatus] || orderStatus;

    // Find sales order by trackingNumber
    const salesOrder = await SalesOrder.findOne({
      trackingNumber: trackingNumber,
    }).populate("items.productId");

    if (!salesOrder) {
      console.error("Sales order not found for trackingNumber:", trackingNumber);
      return res.status(404).json({
        status: "error",
        message: `Sales order not found for tracking number: ${trackingNumber}`,
      });
    }

    const oldStatus = salesOrder.status;
    let returnWarehouse = null;

    // Handle UNBOOKED status - move stock to Unbooked column
    if (internalStatus === "Unbooked") {
      console.log("Processing Unbooked - moving stock to Unbooked column");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToUnbook = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToUnbook <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem) {
            const availableQty = stockItem.quantity || 0;
            if (availableQty > 0) {
              const unbookQty = Math.min(availableQty, quantityToUnbook);

              if (!stockItem.Unbooked) {
                stockItem.Unbooked = 0;
              }
              stockItem.Unbooked += unbookQty;

              quantityToUnbook -= unbookQty;

              await warehouse.save();

              const stockMovement = new StockMovement({
                productId: item.productId,
                warehouseId: warehouse._id,
                movementType: "unbooked",
                quantity: unbookQty,
                previousQuantity: stockItem.quantity + unbookQty,
                newQuantity: stockItem.quantity,
                referenceType: "sales_order",
                referenceId: salesOrder._id,
                notes: `Stock moved to Unbooked for order ${salesOrder.orderNumber}${item.variantName ? " - " + item.variantName : ""} (PostEx webhook)`,
                createdBy: salesOrder.createdBy || null,
              });
              await stockMovement.save();
            }
          }
        }
      }
    }

    // Handle BOOKED status - move from Unbooked to Booked
    if (internalStatus === "Booked") {
      console.log("Processing Booked - moving from Unbooked to Booked");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToBook = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToBook <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem && stockItem.Unbooked > 0) {
            const bookQty = Math.min(stockItem.Unbooked, quantityToBook);

            stockItem.Unbooked -= bookQty;

            if (!stockItem.Booked) {
              stockItem.Booked = 0;
            }
            stockItem.Booked += bookQty;

            quantityToBook -= bookQty;

            await warehouse.save();

            const stockMovement = new StockMovement({
              productId: item.productId,
              warehouseId: warehouse._id,
              movementType: "booked",
              quantity: bookQty,
              previousQuantity: stockItem.quantity,
              newQuantity: stockItem.quantity,
              referenceType: "sales_order",
              referenceId: salesOrder._id,
              notes: `Stock moved to Booked for order ${salesOrder.orderNumber}${item.variantName ? " - " + item.variantName : ""} (PostEx webhook)`,
              createdBy: salesOrder.createdBy || null,
            });
            await stockMovement.save();
          }
        }
      }
    }

    // Handle OUT FOR DELIVERY status - move from Booked to OutForDelivery
    if (internalStatus === "OutForDelivery") {
      console.log("Processing OutForDelivery - moving from Booked to OutForDelivery");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToMove = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToMove <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem && stockItem.Booked > 0) {
            const moveQty = Math.min(stockItem.Booked, quantityToMove);

            stockItem.Booked -= moveQty;

            if (!stockItem.OutForDelivery) {
              stockItem.OutForDelivery = 0;
            }
            stockItem.OutForDelivery += moveQty;

            quantityToMove -= moveQty;

            await warehouse.save();

            const stockMovement = new StockMovement({
              productId: item.productId,
              warehouseId: warehouse._id,
              movementType: "out",
              quantity: moveQty,
              previousQuantity: stockItem.quantity,
              newQuantity: stockItem.quantity,
              referenceType: "sales_order",
              referenceId: salesOrder._id,
              notes: `Stock moved to OutForDelivery for order ${salesOrder.orderNumber}${item.variantName ? " - " + item.variantName : ""} (PostEx webhook)`,
              createdBy: salesOrder.createdBy || null,
            });
            await stockMovement.save();
          }
        }
      }
    }

    // Handle DELIVERED status - move from appropriate previous status to Delivered
    if (internalStatus === "Delivered") {
      console.log("Processing Delivered - moving to Delivered column");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToDeliver = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToDeliver <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem) {
            // Try to move from OutForDelivery first, then Booked as fallback
            let sourceQty = stockItem.OutForDelivery || 0;
            let sourceField = "OutForDelivery";

            if (sourceQty === 0) {
              sourceQty = stockItem.Booked || 0;
              sourceField = "Booked";
            }

            if (sourceQty > 0) {
              const deliverQty = Math.min(sourceQty, quantityToDeliver);

              stockItem[sourceField] -= deliverQty;

              if (!stockItem.Delivered) {
                stockItem.Delivered = 0;
              }
              stockItem.Delivered += deliverQty;

              quantityToDeliver -= deliverQty;

              await warehouse.save();

              const stockMovement = new StockMovement({
                productId: item.productId,
                warehouseId: warehouse._id,
                movementType: "delivered",
                quantity: deliverQty,
                previousQuantity: stockItem.quantity,
                newQuantity: stockItem.quantity,
                referenceType: "sales_order",
                referenceId: salesOrder._id,
                notes: `Stock delivered for order ${salesOrder.orderNumber}${item.variantName ? " - " + item.variantName : ""} (from ${sourceField}) (PostEx webhook)`,
                createdBy: salesOrder.createdBy || null,
              });
              await stockMovement.save();
            }
          }
        }
      }
    }

    // Handle POSTEX WAREHOUSE status - move from Booked to PostExWareHouse
    if (internalStatus === "PostExWareHouse") {
      console.log("Processing PostExWareHouse - moving from Booked to PostExWareHouse");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToMove = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToMove <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem && stockItem.Booked > 0) {
            const moveQty = Math.min(stockItem.Booked, quantityToMove);

            stockItem.Booked -= moveQty;

            if (!stockItem.PostExWareHouse) {
              stockItem.PostExWareHouse = 0;
            }
            stockItem.PostExWareHouse += moveQty;

            quantityToMove -= moveQty;

            await warehouse.save();

            const stockMovement = new StockMovement({
              productId: item.productId,
              warehouseId: warehouse._id,
              movementType: "postex_warehouse",
              quantity: moveQty,
              previousQuantity: stockItem.quantity,
              newQuantity: stockItem.quantity,
              referenceType: "sales_order",
              referenceId: salesOrder._id,
              notes: `Stock moved to PostExWareHouse for order ${salesOrder.orderNumber}${item.variantName ? " - " + item.variantName : ""} (PostEx webhook)`,
              createdBy: salesOrder.createdBy || null,
            });
            await stockMovement.save();
          }
        }
      }
    }

    // Handle RETURNED status - move from Delivered/OutForDelivery to Returned
    if (internalStatus === "Returned") {
      console.log("Processing Returned - moving to Returned column");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToReturn = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToReturn <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem) {
            // Try to move from any possible status - check in order of priority
            const statusFields = [
              "Delivered",
              "OutForDelivery",
              "PostExWareHouse",
              "Booked",
              "PickedByPostEx",
              "EnRouteToPostExwarehouse",
              "OutForReturn",
              "Attempted",
              "DeliveryUnderReview",
            ];

            for (const field of statusFields) {
              if (quantityToReturn <= 0) break;

              const fieldQty = stockItem[field] || 0;
              if (fieldQty > 0) {
                const returnQty = Math.min(fieldQty, quantityToReturn);

                stockItem[field] -= returnQty;

                if (!stockItem.Returned) {
                  stockItem.Returned = 0;
                }
                stockItem.Returned += returnQty;

                quantityToReturn -= returnQty;

                await warehouse.save();

                const stockMovement = new StockMovement({
                  productId: item.productId,
                  warehouseId: warehouse._id,
                  movementType: "returned",
                  quantity: returnQty,
                  previousQuantity: stockItem.quantity,
                  newQuantity: stockItem.quantity,
                  referenceType: "sales_order",
                  referenceId: salesOrder._id,
                  notes: `Stock returned for order ${salesOrder.orderNumber}${item.variantName ? " - " + item.variantName : ""} (from ${field}) (PostEx webhook)`,
                  createdBy: salesOrder.createdBy || null,
                });
                await stockMovement.save();
              }
            }
          }
        }
      }
    }

    // Handle UN-ASSIGNED BY ME status - move from Booked to UnAssignedByMe
    if (internalStatus === "UnAssignedByMe") {
      console.log("Processing UnAssignedByMe - moving from Booked to UnAssignedByMe");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToMove = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToMove <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem && stockItem.Booked > 0) {
            const moveQty = Math.min(stockItem.Booked, quantityToMove);

            stockItem.Booked -= moveQty;

            if (!stockItem.UnAssignedByMe) {
              stockItem.UnAssignedByMe = 0;
            }
            stockItem.UnAssignedByMe += moveQty;

            quantityToMove -= moveQty;

            await warehouse.save();

            const stockMovement = new StockMovement({
              productId: item.productId,
              warehouseId: warehouse._id,
              movementType: "unassigned",
              quantity: moveQty,
              previousQuantity: stockItem.quantity,
              newQuantity: stockItem.quantity,
              referenceType: "sales_order",
              referenceId: salesOrder._id,
              notes: `Stock moved to UnAssignedByMe for order ${salesOrder.orderNumber}${item.variantName ? " - " + item.variantName : ""} (PostEx webhook)`,
              createdBy: salesOrder.createdBy || null,
            });
            await stockMovement.save();
          }
        }
      }
    }

    // Handle EXPIRED status - move from any status to Expired
    if (internalStatus === "Expired") {
      console.log("Processing Expired - moving to Expired column");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToExpire = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToExpire <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem) {
            // Try to move from OutForDelivery first, then Booked as fallback
            let sourceQty = stockItem.OutForDelivery || 0;
            let sourceField = "OutForDelivery";

            if (sourceQty === 0) {
              sourceQty = stockItem.Booked || 0;
              sourceField = "Booked";
            }

            if (sourceQty > 0) {
              const expireQty = Math.min(sourceQty, quantityToExpire);

              stockItem[sourceField] -= expireQty;

              if (!stockItem.Expired) {
                stockItem.Expired = 0;
              }
              stockItem.Expired += expireQty;

              quantityToExpire -= expireQty;

              await warehouse.save();

              const stockMovement = new StockMovement({
                productId: item.productId,
                warehouseId: warehouse._id,
                movementType: "expired",
                quantity: expireQty,
                previousQuantity: stockItem.quantity,
                newQuantity: stockItem.quantity,
                referenceType: "sales_order",
                referenceId: salesOrder._id,
                notes: `Stock expired for order ${salesOrder.orderNumber}${item.variantName ? " - " + item.variantName : ""} (from ${sourceField}) (PostEx webhook)`,
                createdBy: salesOrder.createdBy || null,
              });
              await stockMovement.save();
            }
          }
        }
      }
    }

    // Handle DELIVERY UNDER REVIEW status - move from OutForDelivery to DeliveryUnderReview
    if (internalStatus === "DeliveryUnderReview") {
      console.log("Processing DeliveryUnderReview - moving from OutForDelivery to DeliveryUnderReview");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToMove = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToMove <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem && stockItem.OutForDelivery > 0) {
            const moveQty = Math.min(stockItem.OutForDelivery, quantityToMove);

            stockItem.OutForDelivery -= moveQty;

            if (!stockItem.DeliveryUnderReview) {
              stockItem.DeliveryUnderReview = 0;
            }
            stockItem.DeliveryUnderReview += moveQty;

            quantityToMove -= moveQty;

            await warehouse.save();

            const stockMovement = new StockMovement({
              productId: item.productId,
              warehouseId: warehouse._id,
              movementType: "delivery_under_review",
              quantity: moveQty,
              previousQuantity: stockItem.quantity,
              newQuantity: stockItem.quantity,
              referenceType: "sales_order",
              referenceId: salesOrder._id,
              notes: `Stock moved to DeliveryUnderReview for order ${salesOrder.orderNumber}${item.variantName ? " - " + item.variantName : ""} (PostEx webhook)`,
              createdBy: salesOrder.createdBy || null,
            });
            await stockMovement.save();
          }
        }
      }
    }

    // Handle PICKED BY POSTEX status - move from Booked to PickedByPostEx
    if (internalStatus === "PickedByPostEx") {
      console.log("Processing PickedByPostEx - moving from Booked to PickedByPostEx");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToMove = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToMove <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem && stockItem.Booked > 0) {
            const moveQty = Math.min(stockItem.Booked, quantityToMove);

            stockItem.Booked -= moveQty;

            if (!stockItem.PickedByPostEx) {
              stockItem.PickedByPostEx = 0;
            }
            stockItem.PickedByPostEx += moveQty;

            quantityToMove -= moveQty;

            await warehouse.save();

            const stockMovement = new StockMovement({
              productId: item.productId,
              warehouseId: warehouse._id,
              movementType: "picked_by_postex",
              quantity: moveQty,
              previousQuantity: stockItem.quantity,
              newQuantity: stockItem.quantity,
              referenceType: "sales_order",
              referenceId: salesOrder._id,
              notes: `Stock picked by PostEx for order ${salesOrder.orderNumber}${item.variantName ? " - " + item.variantName : ""} (PostEx webhook)`,
              createdBy: salesOrder.createdBy || null,
            });
            await stockMovement.save();
          }
        }
      }
    }

    // Handle OUT FOR RETURN status - move from Delivered/Returned to OutForReturn
    if (internalStatus === "OutForReturn") {
      console.log("Processing OutForReturn - moving to OutForReturn column");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToMove = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToMove <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem) {
            // Try to move from Returned first, then Delivered as fallback
            let sourceQty = stockItem.Returned || 0;
            let sourceField = "Returned";

            if (sourceQty === 0) {
              sourceQty = stockItem.Delivered || 0;
              sourceField = "Delivered";
            }

            if (sourceQty > 0) {
              const moveQty = Math.min(sourceQty, quantityToMove);

              stockItem[sourceField] -= moveQty;

              if (!stockItem.OutForReturn) {
                stockItem.OutForReturn = 0;
              }
              stockItem.OutForReturn += moveQty;

              quantityToMove -= moveQty;

              await warehouse.save();

              const stockMovement = new StockMovement({
                productId: item.productId,
                warehouseId: warehouse._id,
                movementType: "out_for_return",
                quantity: moveQty,
                previousQuantity: stockItem.quantity,
                newQuantity: stockItem.quantity,
                referenceType: "sales_order",
                referenceId: salesOrder._id,
                notes: `Stock moved to OutForReturn for order ${salesOrder.orderNumber}${item.variantName ? " - " + item.variantName : ""} (from ${sourceField}) (PostEx webhook)`,
                createdBy: salesOrder.createdBy || null,
              });
              await stockMovement.save();
            }
          }
        }
      }
    }

    // Handle ATTEMPTED status - move from OutForDelivery to Attempted
    if (internalStatus === "Attempted") {
      console.log("Processing Attempted - moving from OutForDelivery to Attempted");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToMove = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToMove <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem && stockItem.OutForDelivery > 0) {
            const moveQty = Math.min(stockItem.OutForDelivery, quantityToMove);

            stockItem.OutForDelivery -= moveQty;

            if (!stockItem.Attempted) {
              stockItem.Attempted = 0;
            }
            stockItem.Attempted += moveQty;

            quantityToMove -= moveQty;

            await warehouse.save();

            const stockMovement = new StockMovement({
              productId: item.productId,
              warehouseId: warehouse._id,
              movementType: "attempted",
              quantity: moveQty,
              previousQuantity: stockItem.quantity,
              newQuantity: stockItem.quantity,
              referenceType: "sales_order",
              referenceId: salesOrder._id,
              notes: `Stock attempted delivery for order ${salesOrder.orderNumber}${item.variantName ? " - " + item.variantName : ""} (PostEx webhook)`,
              createdBy: salesOrder.createdBy || null,
            });
            await stockMovement.save();
          }
        }
      }
    }

    // Handle EN-ROUTE TO POSTEX WAREHOUSE status - move from Booked to EnRouteToPostExwarehouse
    if (internalStatus === "EnRouteToPostExwarehouse") {
      console.log("Processing EnRouteToPostExwarehouse - moving from Booked to EnRouteToPostExwarehouse");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToMove = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToMove <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem && stockItem.Booked > 0) {
            const moveQty = Math.min(stockItem.Booked, quantityToMove);

            stockItem.Booked -= moveQty;

            if (!stockItem.EnRouteToPostExwarehouse) {
              stockItem.EnRouteToPostExwarehouse = 0;
            }
            stockItem.EnRouteToPostExwarehouse += moveQty;

            quantityToMove -= moveQty;

            await warehouse.save();

            const stockMovement = new StockMovement({
              productId: item.productId,
              warehouseId: warehouse._id,
              movementType: "en_route_to_postex",
              quantity: moveQty,
              previousQuantity: stockItem.quantity,
              newQuantity: stockItem.quantity,
              referenceType: "sales_order",
              referenceId: salesOrder._id,
              notes: `Stock en-route to PostEx warehouse for order ${salesOrder.orderNumber}${item.variantName ? " - " + item.variantName : ""} (PostEx webhook)`,
              createdBy: salesOrder.createdBy || null,
            });
            await stockMovement.save();
          }
        }
      }
    }

    // Handle CANCELLED status - move back to main quantity from any status
    if (internalStatus === "cancelled") {
      console.log("Processing cancellation - returning stock to main quantity");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToReturn = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToReturn <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem) {
            const statusFields = [
              "Unbooked",
              "Booked",
              "PostExWareHouse",
              "OutForDelivery",
              "Delivered",
              "Returned",
              "UnAssignedByMe",
              "Expired",
              "DeliveryUnderReview",
              "PickedByPostEx",
              "OutForReturn",
              "Attempted",
              "EnRouteToPostExwarehouse",
            ];

            for (const field of statusFields) {
              if (quantityToReturn <= 0) break;

              const fieldQty = stockItem[field] || 0;
              if (fieldQty > 0) {
                const returnQty = Math.min(fieldQty, quantityToReturn);

                stockItem[field] -= returnQty;
                quantityToReturn -= returnQty;

                await warehouse.save();

                const stockMovement = new StockMovement({
                  productId: item.productId,
                  warehouseId: warehouse._id,
                  movementType: "cancelled_return",
                  quantity: returnQty,
                  previousQuantity: stockItem.quantity - returnQty,
                  newQuantity: stockItem.quantity,
                  referenceType: "sales_order",
                  referenceId: salesOrder._id,
                  notes: `Stock returned to main quantity due to cancellation ${salesOrder.orderNumber}${item.variantName ? " - " + item.variantName : ""} (from ${field}) (PostEx webhook)`,
                  createdBy: salesOrder.createdBy || null,
                });
                await stockMovement.save();
              }
            }
          }
        }
      }
    }

    // Update sales order status and tracking number
    salesOrder.status = internalStatus;
    if (trackingNumber) {
      salesOrder.trackingNumber = trackingNumber;
    }
    if (statusUpdateDatetime) {
      salesOrder.actualDeliveryDate = new Date(statusUpdateDatetime);
    }

    await salesOrder.save();

    console.log("Status updated successfully to:", salesOrder.status);

    // Create audit log (using system user if no user available)
    try {
      await createAuditLog(
        salesOrder.createdBy || null,
        "system",
        "sales_order_status_updated",
        "SalesOrder",
        salesOrder._id,
        { status: oldStatus },
        { status: salesOrder.status, trackingNumber },
        { orderNumber: salesOrder.orderNumber, source: "PostEx webhook" },
        req
      );
    } catch (auditError) {
      console.error("Failed to create audit log:", auditError);
      // Don't fail the webhook if audit log fails
    }

    // Always respond with success
    res.status(200).json({
      status: "success",
      message: "Webhook processed successfully",
      orderNumber: salesOrder.orderNumber,
      oldStatus,
      newStatus: salesOrder.status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});
// --------------------
// 🩺 Health Check Route
// --------------------
app.get("/api/health", async (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = dbState === 1 ? "connected" : "disconnected";
  res.json({
    status: "OK",
    message: "Server running",
    database: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

// --------------------
// 🧩 Error Handlers
// --------------------
app.use((error, req, res, next) => {
  console.error("Global error handler:", error);
  res.status(500).json({
    error: "Internal server error",
    message: error.message || "Something went wrong",
  });
});

app.use("*", (req, res) => {
  res.status(404).json({
    error: "Route not found",
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

// --------------------
// 🚀 Start Local Server
// --------------------
if (process.env.NODE_ENV !== "production") {
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
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
});
