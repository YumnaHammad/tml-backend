const mongoose = require('mongoose');

const salesOrderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: true,
    unique: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  customerInfo: {
    name: {
      type: String,
      required: true
    },
    cnNumber: {
      type: String,
      validate: {
        validator: function(v) {
          return !v || /^[A-Za-z0-9]{14}$/.test(v);
        },
        message: 'CN number must be exactly 14 alphanumeric characters'
      }
    },
    phone: {
      type: String,
      validate: {
        validator: function(v) {
          return !v || /^0\d{3}-\d{7}$/.test(v);
        },
        message: 'Phone number must be in format 0XXX-XXXXXXX '
      }
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String
    }
  },
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    variantId: {
      type: String,
      trim: true
    },
    variantName: {
      type: String,
      trim: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  orderDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'dispatch', 'dispatched', 'expected', 'delivered', 'confirmed_delivered', 'expected_return', 'returned', 'cancelled'],
    default: 'pending'
  },
  qcStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'partial', 'refunded'],
    default: 'pending'
  },
  deliveryAddress: {
    street: String,
    city: String,
    country: String
  },
  expectedDeliveryDate: {
    type: Date
  },
  actualDeliveryDate: {
    type: Date
  },
  agentName: {
    type: String
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Pre-save middleware to generate order number
salesOrderSchema.pre('save', async function(next) {
  if (this.isNew && !this.orderNumber) {
    try {
      const count = await this.constructor.countDocuments();
      this.orderNumber = `SO-${String(count + 1).padStart(4, '0')}`;
    } catch (error) {
      // Fallback to timestamp-based number if count fails
      this.orderNumber = `SO-${Date.now().toString().slice(-4)}`;
    }
  }
  next();
});

// Calculate total amount before saving
salesOrderSchema.pre('save', function(next) {
  this.totalAmount = this.items.reduce((total, item) => total + item.totalPrice, 0);
  next();
});

// Add indexes for performance with large datasets
salesOrderSchema.index({ orderDate: -1 }); // For sorting by date
salesOrderSchema.index({ status: 1 }); // For filtering by status
salesOrderSchema.index({ 'customerInfo.phone': 1 }); // For phone number search
salesOrderSchema.index({ 'customerInfo.cnNumber': 1 }); // For CN number search
salesOrderSchema.index({ createdAt: -1 }); // For timestamp sorting
salesOrderSchema.index({ isActive: 1, orderDate: -1 }); // Compound index for common queries
salesOrderSchema.index({ orderNumber: 1 }); // Already unique, but explicit index helps

module.exports = mongoose.model('SalesOrder', salesOrderSchema);