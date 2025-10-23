const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  location: {
    type: String,
    required: true,
    trim: true
  },
  capacity: {
    type: Number,
    required: true,
    min: 1
  },
  currentStock: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    variantId: {
      type: String,
      default: null
    },
    variantName: {
      type: String,
      default: null
    },
    quantity: {
      type: Number,
      default: 0,
      min: 0
    },
    reservedQuantity: {
      type: Number,
      default: 0,
      min: 0
    },
    expectedReturns: {
      type: Number,
      default: 0,
      min: 0
    },
    returnedQuantity: {
      type: Number,
      default: 0,
      min: 0
    },
    deliveredQuantity: {
      type: Number,
      default: 0,
      min: 0
    },
    confirmedDeliveredQuantity: {
      type: Number,
      default: 0,
      min: 0
    },
    tags: [{
      type: String,
      enum: ['returned', 'damaged', 'expired']
    }],
    returnedAt: {
      type: Date
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for efficient searching
warehouseSchema.index({ name: 1 });
warehouseSchema.index({ location: 1 });

// Method to get total stock in warehouse
warehouseSchema.methods.getTotalStock = function() {
  return this.currentStock.reduce((total, item) => total + item.quantity, 0);
};

// Method to get capacity usage percentage
warehouseSchema.methods.getCapacityUsage = function() {
  const totalStock = this.getTotalStock();
  return (totalStock / this.capacity) * 100;
};

// Method to update stock for a product (with variant support)
warehouseSchema.methods.updateStock = function(productId, quantity, tags = [], variantId = null, variantName = null) {
  // Find existing stock item for this product AND variant combination
  const stockItem = this.currentStock.find(item => 
    item.productId.toString() === productId.toString() &&
    (variantId ? item.variantId === variantId : !item.variantId)
  );
  
  if (stockItem) {
    stockItem.quantity += quantity;
    if (tags.includes('returned')) {
      stockItem.tags = [...new Set([...stockItem.tags, ...tags])];
      stockItem.returnedAt = new Date();
    }
  } else {
    this.currentStock.push({
      productId,
      variantId,
      variantName,
      quantity,
      tags,
      returnedAt: tags.includes('returned') ? new Date() : undefined
    });
  }
  
  return this.save();
};

module.exports = mongoose.model('Warehouse', warehouseSchema);