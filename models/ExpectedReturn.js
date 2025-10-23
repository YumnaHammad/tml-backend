const mongoose = require('mongoose');

const expectedReturnSchema = new mongoose.Schema({
  // Link to original sales order
  salesOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesOrder',
    required: true
  },
  orderNumber: {
    type: String,
    required: true
  },
  
  // Customer information
  customerName: {
    type: String,
    required: true
  },
  customerEmail: String,
  customerPhone: String,
  
  // Products expected to return
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    productName: String,
    variantId: String,
    variantName: String,
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    reason: {
      type: String,
      enum: ['defective', 'damaged', 'wrong_item', 'not_needed', 'quality_issue', 'other'],
      default: 'other'
    },
    condition: {
      type: String,
      enum: ['unopened', 'opened', 'damaged', 'defective'],
      default: 'unopened'
    }
  }],
  
  // Return details
  expectedReturnDate: {
    type: Date,
    required: true
  },
  actualReturnDate: Date,
  
  returnReason: {
    type: String,
    required: true
  },
  
  status: {
    type: String,
    enum: ['pending', 'in_transit', 'received', 'cancelled'],
    default: 'pending'
  },
  
  // Warehouse where it will be returned
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse'
  },
  
  notes: String,
  
  // Tracking
  trackingNumber: String,
  
  // Financial
  refundAmount: Number,
  refundStatus: {
    type: String,
    enum: ['pending', 'processed', 'completed'],
    default: 'pending'
  },
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
expectedReturnSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Generate summary
expectedReturnSchema.virtual('totalItems').get(function() {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

module.exports = mongoose.model('ExpectedReturn', expectedReturnSchema);

