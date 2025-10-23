const mongoose = require('mongoose');

const stockMovementSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: true
  },
  movementType: {
    type: String,
    enum: ['in', 'out', 'transfer_in', 'transfer_out', 'adjustment', 'return', 'reserved', 'unreserved'],
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  previousQuantity: {
    type: Number,
    required: true
  },
  newQuantity: {
    type: Number,
    required: true
  },
  referenceType: {
    type: String,
    enum: ['purchase', 'sales', 'sales_order', 'transfer', 'adjustment', 'return'],
    required: true
  },
  referenceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  movementDate: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
stockMovementSchema.index({ productId: 1, warehouseId: 1, movementDate: -1 });
stockMovementSchema.index({ referenceType: 1, referenceId: 1 });

module.exports = mongoose.model('StockMovement', stockMovementSchema);
