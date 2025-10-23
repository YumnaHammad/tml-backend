const mongoose = require('mongoose');

const stockAlertSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: false
  },
  currentStock: {
    type: Number,
    required: true,
    default: 0
  },
  dailyAvailability: {
    type: Number,
    required: true,
    default: 0
  },
  weeklyAvailability: {
    type: Number,
    required: true,
    default: 0
  },
  monthlyAvailability: {
    type: Number,
    required: true,
    default: 0
  },
  alertLevel: {
    type: String,
    enum: ['green', 'yellow', 'red', 'critical'],
    required: true,
    default: 'green'
  },
  alertReason: {
    type: String,
    required: false
  },
  daysOfInventory: {
    type: Number,
    required: false,
    default: 999
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
stockAlertSchema.index({ productId: 1, warehouseId: 1, alertLevel: 1 });
stockAlertSchema.index({ alertLevel: 1, isActive: 1 });

module.exports = mongoose.model('StockAlert', stockAlertSchema);