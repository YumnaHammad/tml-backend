const mongoose = require('mongoose');

// Import all models
const User = require('./User');
const Product = require('./Product');
const Warehouse = require('./Warehouse');
const Supplier = require('./Supplier');
const Customer = require('./Customer');
const Purchase = require('./Purchase');
const Invoice = require('./Invoice');
const Receipt = require('./Receipt');
const SalesOrder = require('./SalesOrder');
const SalesShipment = require('./SalesShipment');
const Return = require('./Return');
const StockMovement = require('./StockMovement');
const StockAlert = require('./StockAlert');
const Report = require('./Report');
const AuditLog = require('./AuditLog');

module.exports = {
  User,
  Product,
  Warehouse,
  Supplier,
  Customer,
  Purchase,
  Invoice,
  Receipt,
  SalesOrder,
  SalesShipment,
  Return,
  StockMovement,
  StockAlert,
  Report,
  AuditLog
};